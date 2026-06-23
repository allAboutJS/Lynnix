/**
 * Lynnix
 * File-based hypermedia routing middleware for Node.js, Mutor.js, and HTMX.
 *
 * @author Onah Victor <victoronah.dev@gmail.com>
 * @repository https://github.com/allAboutJS/Lynnix
 * @license MIT
 */

import type * as http from "node:http";
import type { Cookies, LynnixServerRequest } from "../types.js";
import LynnixRequest from "./lynnixRequest.js";

let cookieParserPromise: Promise<((input: string) => Cookies) | null> | null =
	null;
let qsParserPromise: Promise<
	((input: string) => LynnixServerRequest["query"]) | null
> | null = null;

export default async function augmentRequest(req: http.IncomingMessage) {
	const augmentedRequest = new LynnixRequest(req);
	const baseUrl = `http://${req.headers.host ?? "localhost"}`;
	const cookieParser = await loadCookieParser();

	augmentedRequest.cookies = cookieParser
		? cookieParser(req.headers.cookie ?? "")
		: {};
	augmentedRequest.isHtmx = req.headers["hx-request"] === "true";
	augmentedRequest.htmx = Object.fromEntries(
		Object.entries(req.headers).filter(([k]) => k.startsWith("hx-")),
	) as LynnixServerRequest["htmx"];
	augmentedRequest.query = await parseQueryString(
		new URL(req.url ?? "", baseUrl).search.slice(1),
	);
	augmentedRequest.body = {};
	augmentedRequest.files = {};

	return augmentedRequest;
}

async function parseQueryString(queryString: string) {
	if (!queryString) {
		return {};
	}

	const qsParser = await loadQsParser();

	if (qsParser) {
		return qsParser(queryString);
	}

	const params = new URLSearchParams(queryString);
	const result: Record<string, string | string[]> = {};

	for (const [key, value] of params.entries()) {
		const existing = result[key];
		if (typeof existing === "undefined") {
			result[key] = value;
			continue;
		}

		if (Array.isArray(existing)) {
			existing.push(value);
			continue;
		}

		result[key] = [existing, value];
	}

	return result;
}

async function loadCookieParser() {
	if (!cookieParserPromise) {
		cookieParserPromise = import("cookie")
			.then((mod) => mod.parse.bind(mod))
			.catch(() => null);
	}

	return cookieParserPromise;
}

async function loadQsParser() {
	if (!qsParserPromise) {
		qsParserPromise = import("qs")
			.then((mod) => mod.default.parse.bind(mod.default))
			.catch(() => null);
	}

	return qsParserPromise;
}
