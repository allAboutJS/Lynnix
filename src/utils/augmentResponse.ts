/**
 * Lynnix
 * File-based hypermedia routing middleware for Node.js, Mutor.js, and HTMX.
 *
 * @author Onah Victor <victoronah.dev@gmail.com>
 * @repository https://github.com/allAboutJS/Lynnix
 * @license MIT
 */

import type * as http from "node:http";
import type { Cookies } from "../types.js";
import LynnixResponse, { type CookieModule } from "./lynnixResponse.js";

let cookieModulePromise: Promise<CookieModule | null> | null = null;

/**
 * Augments the response object with utility methods.
 *
 * @param res The raw response object
 */
export default async function augmentResponse(
	res: http.ServerResponse<http.IncomingMessage>,
	isHtmx: boolean,
) {
	const cookieModule = await loadCookieModule();
	const responseCookies = readResponseCookies(res, cookieModule);

	// Prevent caching for HTMX requests
	if (isHtmx) {
		res.setHeader("Vary", "HX-Request");
		res.setHeader("Cache-Control", "no-store");
	}

	return new LynnixResponse(res, isHtmx, cookieModule, responseCookies);
}

function normalizeSetCookieHeader(
	header: string | string[] | number | undefined,
) {
	if (Array.isArray(header)) {
		return header.filter((value): value is string => typeof value === "string");
	}

	if (typeof header === "string") {
		return [header];
	}

	return [];
}

function readResponseCookies(
	res: http.ServerResponse<http.IncomingMessage>,
	cookieModule: CookieModule | null,
) {
	const cookies = {} as Cookies;
	const existingHeaders = normalizeSetCookieHeader(res.getHeader("Set-Cookie"));

	if (!cookieModule) {
		return cookies;
	}

	for (let i = 0; i < existingHeaders.length; i++) {
		try {
			const parsed = cookieModule.parseSetCookie(existingHeaders[i]);
			cookies[parsed.name] = parsed.value;
		} catch {}
	}

	return cookies;
}

async function loadCookieModule() {
	if (!cookieModulePromise) {
		cookieModulePromise = import("cookie")
			.then((mod) => ({
				serialize: mod.serialize.bind(mod),
				parseSetCookie: mod.parseSetCookie.bind(mod),
			}))
			.catch(() => null);
	}

	return cookieModulePromise;
}
