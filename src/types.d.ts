/**
 * Lynnix
 * File-based hypermedia routing middleware for Node.js, Mutor.js, and HTMX.
 *
 * @author Onah Victor <victoronah.dev@gmail.com>
 * @repository https://github.com/allAboutJS/Lynnix
 * @license MIT
 */

import type * as http from "node:http";

export type RoutesMap = Record<
	string,
	{
		page?: string;
		fragment?: string;
		loader?: string;
		error?: string;
		notFound?: string;
		fragmentNotFound?: string;
		fragmentError?: string;
		middleware?: string;
	}
>;

export type HtmxHeaders = Record<`hx-${string}`, string>;
export type Cookies = Record<string, string | undefined>;
export type CookieOptions = {
	domain?: string;
	expires?: Date;
	httpOnly?: boolean;
	maxAge?: number;
	partitioned?: boolean;
	path?: string;
	priority?: "low" | "medium" | "high";
	sameSite?: boolean | "lax" | "strict" | "none";
	secure?: boolean;
	encode?: (value: string) => string;
};
export type LynnixUploadedFiles = Record<
	string,
	ParsedUploadedFile | ParsedUploadedFile[]
>;

export interface LynnixServerResponse
	extends http.ServerResponse<http.IncomingMessage> {
	setCookie(name: string, value: string, options: CookieOptions): void;
	cookies: Cookies;
	deleteCookie(name: string): void;
	redirect(url: string, permanent?: boolean): void;
	html(content: string): void;
	json(content: unknown): void;
	status(code: number): this;
	htmxTrigger(event: string | Record<string, unknown>): void;
	htmxTriggerAfterSwap(event: string | Record<string, unknown>): void;
	htmxTriggerAfterSettle(event: string | Record<string, unknown>): void;
	htmxPush(url: string | false): void;
	htmxReswap(
		strategy:
			| "innerHTML"
			| "outerHTML"
			| "beforebegin"
			| "afterbegin"
			| "beforeend"
			| "afterend"
			| "delete"
			| "none",
	): void;
	htmxReplaceUrl(url: string | false): void;
	htmxRetarget(selector: string): void;
	htmxReselect(selector: string): void;
	htmxRefresh(): void;
	htmxRedirect(url: string): void;
	htmxLocation(
		location:
			| string
			| {
					path: string;
					target?: string;
					swap?: string;
					select?: string;
					values?: Record<string, unknown>;
					headers?: Record<string, string>;
			  },
	): void;
}

export interface LynnixServerRequest extends http.IncomingMessage {
	body: Record<string, unknown>;
	files: LynnixUploadedFiles;
	cookies: Cookies;
	query:
		| string
		| Record<string, unknown>
		| (string | Record<string, unknown>)[]
		| undefined
		| Record<string, string | string[]>;
	params: Record<string, string | undefined>;
	htmx: HtmxHeaders;
	isHtmx: boolean;
}

export type BoundaryKey =
	| "error"
	| "notFound"
	| "fragmentError"
	| "fragmentNotFound";

export interface ParsedUploadedFile {
	fieldName: string;
	filename: string;
	encoding: string;
	mimeType: string;
	size: number;
	buffer: Buffer;
	truncated: boolean;
}

export interface ParseReqBodyOptions {
	bodyLimit?: number;
	jsonLimit?: number;
	fieldNameSize?: number;
	fieldSize?: number;
	fields?: number;
	fileSize?: number;
	files?: number;
	parts?: number;
	headerPairs?: number;
	headerSize?: number;
	allowedMimeTypes?: string[];
	allowMultipleFilesPerField?: boolean;
	preservePath?: boolean;
	qsOptions?: Record<string, unknown>;
}

export type ParsedRequestBody = {
	body: Record<string, unknown> | unknown;
	files: Record<string, ParsedUploadedFile | ParsedUploadedFile[]>;
};

type BusboyInstance = {
	on(event: string, listener: (...args: unknown[]) => void): BusboyInstance;
};

export type BusboyConstructor = new (
	options: Record<string, unknown>,
) => BusboyInstance;

export type BusboyFileStream = NodeJS.ReadableStream & {
	truncated?: boolean;
	bytesRead?: number;
	resume(): void;
	on(event: string, listener: (...args: unknown[]) => void): BusboyFileStream;
};

export type QsModule = {
	parse: (input: string, options?: Record<string, unknown>) => unknown;
};
