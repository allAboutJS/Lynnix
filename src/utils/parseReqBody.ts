/**
 * Lynnix
 * File-based hypermedia routing middleware for Node.js, Mutor.js, and HTMX.
 *
 * @author Onah Victor <victoronah.dev@gmail.com>
 * @repository https://github.com/allAboutJS/Lynnix
 * @license MIT
 */

import type * as http from "node:http";
import type {
	BusboyConstructor,
	BusboyFileStream,
	ParsedRequestBody,
	ParsedUploadedFile,
	ParseReqBodyOptions,
	QsModule,
} from "../types.js";

const DEFAULT_BODY_LIMIT = 1024 * 1024;
const DEFAULT_FILE_SIZE_LIMIT = 10 * 1024 * 1024;
const DEFAULT_FILE_COUNT_LIMIT = 10;
const DEFAULT_FIELD_COUNT_LIMIT = 100;
const DEFAULT_PART_COUNT_LIMIT = 110;

let bodyParserJsonPromise: Promise<JsonBodyParserMiddlewareFactory> | null =
	null;
let busboyConstructorPromise: Promise<BusboyConstructor> | null = null;
let qsModulePromise: Promise<QsModule | null> | null = null;

/**
 * Parses the request body based on the content type and returns a parsed request body object.
 *
 * @param req The incoming request object.
 * @param _res The server response object.
 * @param options The options for parsing the request body.
 * @returns The parsed request body object.
 */
export default async function parseReqBody(
	req: http.IncomingMessage & {
		body?: unknown;
		files?: Record<string, ParsedUploadedFile | ParsedUploadedFile[]>;
	},
	_res: http.ServerResponse<http.IncomingMessage>,
	options: ParseReqBodyOptions = {},
): Promise<ParsedRequestBody> {
	if (!req.method || ["GET", "HEAD"].includes(req.method.toUpperCase())) {
		const result = { body: {}, files: {} };
		req.body = result.body;
		req.files = result.files;
		return result;
	}

	const contentType = getHeaderValue(req.headers["content-type"]).toLowerCase();

	if (!contentType) {
		const result = { body: {}, files: {} };
		req.body = result.body;
		req.files = result.files;
		return result;
	}

	if (contentType.includes("application/json")) {
		const result = await parseJsonRequestBody(req, _res, options);
		req.body = result.body;
		req.files = result.files;
		return result;
	}

	if (contentType.includes("application/x-www-form-urlencoded")) {
		const result = await parseUrlEncodedBody(req, options);
		req.body = result.body;
		req.files = result.files;
		return result;
	}

	if (contentType.includes("multipart/form-data")) {
		const result = await parseMultipartBody(req, options);
		req.body = result.body;
		req.files = result.files;
		return result;
	}

	const result = { body: {}, files: {} };
	req.body = result.body;
	req.files = result.files;
	return result;
}

type JsonBodyParserMiddlewareFactory = (options?: {
	limit?: number | string;
}) => (
	req: http.IncomingMessage & { body?: unknown },
	res: http.ServerResponse<http.IncomingMessage>,
	next: (error?: unknown) => void,
) => void;

async function parseJsonRequestBody(
	req: http.IncomingMessage & { body?: unknown },
	res: http.ServerResponse<http.IncomingMessage>,
	options: ParseReqBodyOptions,
): Promise<ParsedRequestBody> {
	const createJsonParser = await loadJsonBodyParser();
	const jsonParser = createJsonParser({
		limit: options.jsonLimit ?? options.bodyLimit ?? DEFAULT_BODY_LIMIT,
	});

	await new Promise<void>((resolve, reject) => {
		jsonParser(req, res, (error?: unknown) => {
			if (error) {
				reject(normalizeError(error, "Failed to parse JSON request body"));
				return;
			}

			resolve();
		});
	});

	return {
		body: req.body ?? {},
		files: {},
	};
}

async function parseUrlEncodedBody(
	req: http.IncomingMessage,
	options: ParseReqBodyOptions,
): Promise<ParsedRequestBody> {
	const Busboy = await loadBusboy();
	const entries: Array<[string, string]> = [];

	return new Promise((resolve, reject) => {
		const busboy = new Busboy({
			headers: req.headers,
			limits: {
				fieldNameSize: options.fieldNameSize,
				fieldSize: options.fieldSize ?? options.bodyLimit ?? DEFAULT_BODY_LIMIT,
				fields: options.fields ?? DEFAULT_FIELD_COUNT_LIMIT,
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
							`Urlencoded field name exceeded the allowed size: ${fieldName}`,
						),
					);
					return;
				}

				if (valueTruncated) {
					fail(
						new Error(
							`Urlencoded field value exceeded the allowed size: ${fieldName}`,
						),
					);
					return;
				}

				entries.push([fieldName, value]);
			},
		);

		busboy.on("fieldsLimit", () => {
			fail(new Error("Urlencoded request exceeded the configured field limit"));
		});

		busboy.on("partsLimit", () => {
			fail(new Error("Urlencoded request exceeded the configured parts limit"));
		});

		busboy.on("error", (error) => {
			fail(normalizeError(error, "Failed to parse urlencoded request body"));
		});

		busboy.on("finish", async () => {
			if (settled) {
				return;
			}

			try {
				const body = await parseUrlEncodedEntries(entries, options);
				settled = true;
				resolve({ body, files: {} });
			} catch (error) {
				fail(normalizeError(error, "Failed to parse urlencoded request body"));
			}
		});

		req.pipe(busboy as unknown as NodeJS.WritableStream);
	});
}

async function parseMultipartBody(
	req: http.IncomingMessage,
	options: ParseReqBodyOptions,
): Promise<ParsedRequestBody> {
	const Busboy = await loadBusboy();
	const body: Record<string, unknown> = {};
	const files: Record<string, ParsedUploadedFile | ParsedUploadedFile[]> = {};
	const filePromises: Promise<void>[] = [];
	const allowedMimeTypes = options.allowedMimeTypes ?? null;
	const allowMultipleFilesPerField =
		options.allowMultipleFilesPerField ?? false;

	return new Promise((resolve, reject) => {
		const busboy = new Busboy({
			headers: req.headers,
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

		req.pipe(busboy as unknown as NodeJS.WritableStream);
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
			const buffer = toBuffer(chunk);
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

async function parseUrlEncodedEntries(
	entries: Array<[string, string]>,
	options: ParseReqBodyOptions,
) {
	if (!entries.length) {
		return {};
	}

	const queryString = entries
		.map(
			([key, value]) =>
				`${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
		)
		.join("&");
	const qsModule = await loadQsModule();

	if (qsModule) {
		return qsModule.parse(queryString, options.qsOptions);
	}

	const fallback: Record<string, unknown> = {};

	for (let i = 0; i < entries.length; i++) {
		const [key, value] = entries[i];
		appendValue(fallback, key, value);
	}

	return fallback;
}

async function loadJsonBodyParser() {
	if (!bodyParserJsonPromise) {
		bodyParserJsonPromise = import("body-parser")
			.then((mod) => mod.default.json.bind(mod.default))
			.catch(() => {
				throw new Error(
					'Parsing JSON requests requires the optional peer dependency "body-parser"',
				);
			});
	}

	return bodyParserJsonPromise;
}

async function loadBusboy() {
	if (!busboyConstructorPromise) {
		busboyConstructorPromise = import("@fastify/busboy")
			.then((mod) => mod.default as unknown as BusboyConstructor)
			.catch(() => {
				console.error(
					'[Lynnix] Parsing form requests requires the optional peer dependency "@fastify/busboy"',
				);
				return null;
			});
	}

	return busboyConstructorPromise;
}

async function loadQsModule() {
	if (!qsModulePromise) {
		qsModulePromise = import("qs")
			.then((mod) => ({ parse: mod.default.parse.bind(mod.default) }))
			.catch(() => {
				console.error(
					'[Lynnix] Parsing query strings requires the optional peer dependency "qs"',
				);
				return null;
			});
	}

	return qsModulePromise;
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
