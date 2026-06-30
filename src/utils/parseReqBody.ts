/**
 * Lynnix
 * File-based hypermedia routing middleware for Node.js, Mutor.js, and HTMX.
 *
 * @author Onah Victor <victoronah.dev@gmail.com>
 * @repository https://github.com/allAboutJS/Lynnix
 * @license MIT
 */
/**
 * Parse an incoming request body into a Lynnix-friendly shape.
 *
 * Supported content types:
 * - `application/json`
 * - `application/x-www-form-urlencoded`
 * - `multipart/form-data`
 *
 * Parsed text values are assigned to `req.body` and uploaded files are assigned
 * to `req.files`, similar to middleware such as multer/formidable.
 *
 * Design goals:
 * - stream-based parsing for forms/uploads
 * - bounded in-memory buffering for cross-environment compatibility
 * - no temporary filesystem dependency, so it works in serverless runtimes too
 * - dynamic imports for optional peer dependencies like `@fastify/busboy` and `qs`
 */

import qs from "qs";
import type {
	BusboyConstructor,
	BusboyFileStream,
	LynnixServerRequest,
	ParsedRequestBody,
	ParsedUploadedFile,
	ParseReqBodyOptions,
} from "../types.js";
import { HttpError } from "./error.js";

const DEFAULT_BODY_LIMIT = 1024 * 1024;
const DEFAULT_FILE_SIZE_LIMIT = 10 * 1024 * 1024;
const DEFAULT_FILE_COUNT_LIMIT = 10;
const DEFAULT_FIELD_COUNT_LIMIT = 100;
const DEFAULT_PART_COUNT_LIMIT = 110;

let busboyConstructorPromise: Promise<BusboyConstructor> | null = null;

export default async function parseReqBody(
	req: LynnixServerRequest,
	options: ParseReqBodyOptions = {},
) {
	const rawReq = req.raw;

	if (!rawReq.method || ["GET", "HEAD"].includes(rawReq.method.toUpperCase())) {
		req.body = {};
		req.files = {};
		return;
	}

	const contentType = getHeaderValue(
		rawReq.headers["content-type"],
	).toLowerCase();

	if (!contentType) {
		req.body = {};
		req.files = {};
		return;
	}

	if (contentType.includes("application/json")) {
		const raw = await bufferReqBody(req, options);

		try {
			req.body = raw.trim().length ? JSON.parse(raw) : {};
		} catch {
			throw new HttpError(400, "Invalid JSON body");
		}

		req.files = {};
		return;
	}

	if (contentType.includes("application/x-www-form-urlencoded")) {
		req.body = qs.parse(await bufferReqBody(req, options), options.qsOptions);
		req.files = {};
		return;
	}

	if (contentType.includes("multipart/form-data")) {
		const result = await parseMultipartBody(req, options);

		if (result) {
			req.body = result.body as Record<string, unknown>;
			req.files = result.files;
		}

		return;
	}

	req.body = {};
	req.files = {};
}

async function bufferReqBody(
	req: LynnixServerRequest,
	options: ParseReqBodyOptions,
): Promise<string> {
	const bodyLimit = options.bodyLimit ?? DEFAULT_BODY_LIMIT;

	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let receivedBytes = 0;
		let aborted = false;

		req.raw.on("data", (chunk: Buffer) => {
			if (aborted) return;

			receivedBytes += chunk.length;

			if (receivedBytes > bodyLimit) {
				aborted = true;
				req.raw.destroy();
				reject(
					new HttpError(413, `Request body size exceeds ${bodyLimit} bytes`),
				);
				return;
			}

			chunks.push(chunk);
		});

		req.raw.on("end", () => {
			if (aborted) return;

			if (chunks.length === 0) {
				return resolve("");
			}

			resolve(Buffer.concat(chunks).toString("utf-8"));
		});

		req.raw.on("error", (err) => {
			if (!aborted) {
				aborted = true;
				reject(err);
			}
		});
	});
}

async function parseMultipartBody(
	req: LynnixServerRequest,
	options: ParseReqBodyOptions,
): Promise<ParsedRequestBody> {
	const Busboy = await loadBusboy();

	if (!Busboy) {
		console.error(
			`[Lynnix] Parsing multipart requests requires the optional peer dependency "@fastify/busboy"`,
		);
		return { body: {}, files: {} };
	}

	const body: Record<string, unknown> = {};
	const files: Record<string, ParsedUploadedFile | ParsedUploadedFile[]> = {};
	const filePromises: Promise<void>[] = [];
	const allowedMimeTypes = options.allowedMimeTypes ?? null;
	const allowMultipleFilesPerField =
		options.allowMultipleFilesPerField ?? false;
	const rawReq = req.raw;

	return new Promise((resolve, reject) => {
		const busboy = new Busboy({
			headers: rawReq.headers,
			preservePath: options.preservePath ?? false,
			limits: {
				fieldNameSize: options.fieldNameSize,
				fieldSize: options.fieldSize ?? DEFAULT_BODY_LIMIT,
				fields: options.fields ?? DEFAULT_FIELD_COUNT_LIMIT,
				fileSize: options.fileSize ?? DEFAULT_FILE_SIZE_LIMIT,
				files: options.files ?? DEFAULT_FILE_COUNT_LIMIT,
				parts: options.parts ?? DEFAULT_PART_COUNT_LIMIT,
				headerPairs: options.headerPairs,
				headerSize: options.headerSize,
			},
		});

		let settled = false;

		const fail = (error: Error) => {
			if (settled) {
				return;
			}

			settled = true;
			reject(error);
		};

		busboy.on(
			"field",
			(
				fieldName: string,
				value: string,
				fieldNameTruncated: boolean,
				valueTruncated: boolean,
			) => {
				if (fieldNameTruncated) {
					fail(
						new Error(
							`Multipart field name exceeded the allowed size: ${fieldName}`,
						),
					);
					return;
				}

				if (valueTruncated) {
					fail(
						new Error(
							`Multipart field value exceeded the allowed size: ${fieldName}`,
						),
					);
					return;
				}

				appendValue(body, fieldName, value);
			},
		);

		busboy.on(
			"file",
			(
				fieldName: string,
				stream: BusboyFileStream,
				filename: string,
				encoding: string,
				mimeType: string,
			) => {
				// Busboy can surface unnamed file parts. If there is no filename, we
				// treat the part as discardable and drain the stream so parsing can finish.
				if (!filename) {
					stream.resume();
					return;
				}

				// Reject unsupported uploads as early as possible, but always resume the
				// stream first so Busboy can continue consuming the rest of the request.
				if (allowedMimeTypes && !matchesMimeType(mimeType, allowedMimeTypes)) {
					stream.resume();
					fail(
						new Error(
							`File field ${fieldName} uses unsupported mime type ${mimeType}`,
						),
					);
					return;
				}

				// Enforce the single-file-per-field contract before buffering anything.
				if (!allowMultipleFilesPerField && files[fieldName]) {
					stream.resume();
					fail(
						new Error(
							`Multiple files are not allowed for the field ${fieldName}`,
						),
					);
					return;
				}

				// File contents are buffered in memory with size limits instead of being
				// written to disk. This keeps the parser portable across Node servers and
				// serverless environments where temp storage may be unavailable.
				const filePromise = consumeFileStream(
					stream,
					fieldName,
					filename,
					encoding,
					mimeType,
				).then((file) => {
					appendFile(files, fieldName, file, allowMultipleFilesPerField);
				});

				filePromises.push(
					filePromise.catch((error) =>
						fail(normalizeError(error, "Failed to read uploaded file")),
					),
				);
			},
		);

		busboy.on("filesLimit", () => {
			fail(new Error("Multipart request exceeded the configured file limit"));
		});

		busboy.on("fieldsLimit", () => {
			fail(new Error("Multipart request exceeded the configured field limit"));
		});

		busboy.on("partsLimit", () => {
			fail(new Error("Multipart request exceeded the configured parts limit"));
		});

		busboy.on("error", (error) => {
			fail(normalizeError(error, "Failed to parse multipart request body"));
		});

		busboy.on("finish", () => {
			Promise.all(filePromises)
				.then(() => {
					if (settled) {
						return;
					}

					settled = true;
					resolve({ body, files });
				})
				.catch((error) => {
					fail(
						normalizeError(error, "Failed to finalize multipart request body"),
					);
				});
		});

		rawReq.pipe(busboy as unknown as NodeJS.WritableStream);
	});
}

/**
 * Consume one uploaded file stream into a bounded in-memory buffer.
 *
 * The stream is fully drained so Busboy can complete parsing, but uploads that
 * hit configured limits are rejected instead of being silently truncated.
 */
async function consumeFileStream(
	stream: BusboyFileStream,
	fieldName: string,
	filename: string,
	encoding: string,
	mimeType: string,
): Promise<ParsedUploadedFile> {
	const chunks: Buffer[] = [];
	let size = 0;
	let limitReached = false;

	return new Promise((resolve, reject) => {
		// Busboy emits `limit` when the configured file size is exceeded. We keep
		// draining until `end`, then reject with a deterministic error.
		stream.on("limit", () => {
			limitReached = true;
		});

		stream.on("data", (chunk) => {
			const buffer = toBuffer(chunk as string | Buffer);
			size += buffer.length;
			chunks.push(buffer);
		});

		stream.on("error", (error) => {
			reject(
				normalizeError(error, `Failed to process uploaded file ${filename}`),
			);
		});

		stream.on("end", () => {
			// Reject oversized files instead of returning partial buffers. That keeps
			// downstream handlers from accidentally treating truncated uploads as valid.
			if (limitReached || stream.truncated) {
				reject(
					new Error(
						`Uploaded file for field ${fieldName} exceeded the configured file size limit`,
					),
				);
				return;
			}

			resolve({
				fieldName,
				filename,
				encoding,
				mimeType,
				size,
				buffer: Buffer.concat(chunks),
				truncated: false,
			});
		});
	});
}

async function loadBusboy() {
	if (!busboyConstructorPromise) {
		busboyConstructorPromise = import("@fastify/busboy")
			.then((mod) => mod.default as unknown as BusboyConstructor)
			.catch(() => {
				console.log(
					`[Lynnix] Parsing form requests requires the optional peer dependency "@fastify/busboy"`,
				);
				return null;
			});
	}

	return busboyConstructorPromise;
}

function appendValue(
	target: Record<string, unknown>,
	key: string,
	value: unknown,
) {
	const existing = target[key];

	if (typeof existing === "undefined") {
		target[key] = value;
		return;
	}

	if (Array.isArray(existing)) {
		existing.push(value);
		return;
	}

	target[key] = [existing, value];
}

function appendFile(
	target: Record<string, ParsedUploadedFile | ParsedUploadedFile[]>,
	key: string,
	file: ParsedUploadedFile,
	allowMultipleFilesPerField: boolean,
) {
	const existing = target[key];

	if (typeof existing === "undefined") {
		target[key] = allowMultipleFilesPerField ? [file] : file;
		return;
	}

	if (Array.isArray(existing)) {
		existing.push(file);
		return;
	}

	target[key] = [existing, file];
}

function matchesMimeType(mimeType: string, allowedMimeTypes: string[]) {
	for (let i = 0; i < allowedMimeTypes.length; i++) {
		const allowed = allowedMimeTypes[i];

		if (allowed === mimeType) {
			return true;
		}

		if (allowed.endsWith("/*")) {
			const prefix = allowed.slice(0, allowed.indexOf("/"));
			if (mimeType.startsWith(`${prefix}/`)) {
				return true;
			}
		}
	}

	return false;
}

function getHeaderValue(value: string | string[] | undefined) {
	if (Array.isArray(value)) {
		return value[0] ?? "";
	}

	return value ?? "";
}

function normalizeError(error: unknown, fallbackMessage: string) {
	if (error instanceof Error) {
		return error;
	}

	return new Error(fallbackMessage);
}

function toBuffer(chunk: string | Buffer) {
	return Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
}
