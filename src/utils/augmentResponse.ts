/**
 * Lynnix
 * File-based hypermedia routing middleware for Node.js, Mutor.js, and HTMX.
 *
 * @author Onah Victor <victoronah.dev@gmail.com>
 * @repository https://github.com/allAboutJS/Lynnix
 * @license MIT
 */

import type * as http from "node:http";
import type { CookieOptions, Cookies, LynnixServerResponse } from "../types.js";

type CookieModule = {
	serialize(name: string, value: string, options?: CookieOptions): string;
	parseSetCookie(cookieHeader: string): { name: string; value: string };
};

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
	const augmentedResponse = res as LynnixServerResponse;
	const cookieModule = await loadCookieModule();
	const responseCookies = readResponseCookies(augmentedResponse, cookieModule);

	augmentedResponse.setCookie = (
		name: string,
		value: string,
		options: CookieOptions,
	) => {
		if (!cookieModule) {
			throw new Error(
				'Setting cookies requires the optional peer dependency "cookie"',
			);
		}

		const serializedCookie = cookieModule.serialize(name, value, options);
		const existingCookies = normalizeSetCookieHeader(
			augmentedResponse.getHeader("Set-Cookie"),
		).filter((cookie) => getSetCookieName(cookie, cookieModule) !== name);

		existingCookies.push(serializedCookie);
		augmentedResponse.setHeader("Set-Cookie", existingCookies);
		responseCookies[name] = value;
	};

	augmentedResponse.cookies = responseCookies;

	augmentedResponse.html = (content: string) => {
		augmentedResponse.setHeader("Content-Type", "text/html; charset=utf-8");
		augmentedResponse.end(content);
	};

	augmentedResponse.json = (content: unknown) => {
		augmentedResponse.setHeader(
			"Content-Type",
			"application/json; charset=utf-8",
		);
		augmentedResponse.end(JSON.stringify(content));
	};

	augmentedResponse.status = (code: number) => {
		augmentedResponse.statusCode = code;
		return augmentedResponse;
	};

	augmentedResponse.redirect = (url: string, permanent?: boolean) => {
		augmentedResponse.statusCode = permanent ? 301 : 302;

		if (isHtmx) {
			augmentedResponse.setHeader("HX-Redirect", url);
		} else {
			augmentedResponse.setHeader("Location", url);
		}

		augmentedResponse.end();
	};

	augmentedResponse.deleteCookie = (name: string) => {
		if (!cookieModule) {
			throw new Error(
				'Deleting cookies requires the optional peer dependency "cookie"',
			);
		}

		const existingCookies = normalizeSetCookieHeader(
			augmentedResponse.getHeader("Set-Cookie"),
		).filter((cookie) => getSetCookieName(cookie, cookieModule) !== name);
		const expiredCookie = cookieModule.serialize(name, "", {
			maxAge: 0,
			path: "/",
		});

		existingCookies.push(expiredCookie);
		augmentedResponse.setHeader("Set-Cookie", existingCookies);
		delete responseCookies[name];
	};

	augmentedResponse.htmxTrigger = (event: string | Record<string, unknown>) => {
		if (isHtmx) {
			augmentedResponse.setHeader(
				"HX-Trigger",
				typeof event === "string" ? event : JSON.stringify(event),
			);
		}
	};

	augmentedResponse.htmxTriggerAfterSwap = (
		event: string | Record<string, unknown>,
	) => {
		if (isHtmx) {
			augmentedResponse.setHeader(
				"HX-Trigger-After-Swap",
				typeof event === "string" ? event : JSON.stringify(event),
			);
		}
	};

	augmentedResponse.htmxTriggerAfterSettle = (
		event: string | Record<string, unknown>,
	) => {
		if (isHtmx) {
			augmentedResponse.setHeader(
				"HX-Trigger-After-Settle",
				typeof event === "string" ? event : JSON.stringify(event),
			);
		}
	};

	augmentedResponse.htmxPush = (url: string | false) => {
		if (isHtmx) {
			augmentedResponse.setHeader("HX-Push-Url", url === false ? "false" : url);
		}
	};

	augmentedResponse.htmxReplaceUrl = (url: string | false) => {
		if (isHtmx) {
			augmentedResponse.setHeader(
				"HX-Replace-Url",
				url === false ? "false" : url,
			);
		}
	};

	augmentedResponse.htmxRetarget = (selector) => {
		if (isHtmx) {
			augmentedResponse.setHeader("HX-Retarget", selector);
		}
	};

	augmentedResponse.htmxReselect = (selector) => {
		if (isHtmx) {
			augmentedResponse.setHeader("HX-Reselect", selector);
		}
	};

	augmentedResponse.htmxReswap = (strategy) => {
		if (isHtmx) {
			augmentedResponse.setHeader("HX-Reswap", strategy);
		}
	};

	augmentedResponse.htmxRefresh = () => {
		if (isHtmx) {
			augmentedResponse.setHeader("HX-Refresh", "true");
		}
	};

	augmentedResponse.htmxRedirect = (url) => {
		if (isHtmx) {
			augmentedResponse.setHeader("HX-Redirect", url);
		}
	};

	augmentedResponse.htmxLocation = (location) => {
		if (isHtmx) {
			augmentedResponse.setHeader(
				"HX-Location",
				typeof location === "string" ? location : JSON.stringify(location),
			);
		}
	};

	return augmentedResponse;
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

function getSetCookieName(
	cookieHeader: string,
	cookieModule: CookieModule | null,
) {
	if (!cookieModule) {
		return "";
	}

	try {
		return cookieModule.parseSetCookie(cookieHeader).name;
	} catch {
		return "";
	}
}

function readResponseCookies(
	res: LynnixServerResponse,
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
