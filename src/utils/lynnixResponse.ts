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

export default class LynnixResponse implements LynnixServerResponse {
	cookies: Cookies;

	constructor(
		public readonly raw: http.ServerResponse<http.IncomingMessage>,
		private readonly isHtmx: boolean,
		private readonly cookieModule: CookieModule | null,
		cookies: Cookies = {},
	) {
		this.cookies = cookies;
	}

	setCookie(name: string, value: string, options: CookieOptions): void {
		if (!this.cookieModule) {
			console.error(
				'[Lynnix] Setting cookies requires the optional peer dependency "cookie"',
			);
			return;
		}

		const serializedCookie = this.cookieModule.serialize(name, value, options);
		const existingCookies = this.normalizeSetCookieHeader(
			this.raw.getHeader("Set-Cookie"),
		).filter((cookie) => this.getSetCookieName(cookie) !== name);

		existingCookies.push(serializedCookie);
		this.raw.setHeader("Set-Cookie", existingCookies);
		this.cookies[name] = value;
	}

	deleteCookie(name: string): void {
		if (!this.cookieModule) {
			console.error(
				'[Lynnix] Deleting cookies requires the optional peer dependency "cookie"',
			);
			return;
		}

		const existingCookies = this.normalizeSetCookieHeader(
			this.raw.getHeader("Set-Cookie"),
		).filter((cookie) => this.getSetCookieName(cookie) !== name);

		const expiredCookie = this.cookieModule.serialize(name, "", {
			maxAge: 0,
			path: "/",
		});

		existingCookies.push(expiredCookie);
		this.raw.setHeader("Set-Cookie", existingCookies);
		delete this.cookies[name];
	}

	redirect(url: string, permanent?: boolean): void {
		this.raw.statusCode = permanent ? 301 : 302;

		if (this.isHtmx) {
			this.raw.setHeader("HX-Redirect", url);
		} else {
			this.raw.setHeader("Location", url);
		}

		this.raw.end();
	}

	html(content: string): void {
		this.raw.setHeader("Content-Type", "text/html; charset=utf-8");
		this.raw.end(content);
	}

	json(content: unknown): void {
		this.raw.setHeader("Content-Type", "application/json; charset=utf-8");
		this.raw.end(JSON.stringify(content));
	}

	status(code: number): this {
		this.raw.statusCode = code;
		return this;
	}

	htmxTrigger(event: string | Record<string, unknown>): void {
		if (this.isHtmx) {
			this.raw.setHeader(
				"HX-Trigger",
				typeof event === "string" ? event : JSON.stringify(event),
			);
		}
	}

	htmxTriggerAfterSwap(event: string | Record<string, unknown>): void {
		if (this.isHtmx) {
			this.raw.setHeader(
				"HX-Trigger-After-Swap",
				typeof event === "string" ? event : JSON.stringify(event),
			);
		}
	}

	htmxTriggerAfterSettle(event: string | Record<string, unknown>): void {
		if (this.isHtmx) {
			this.raw.setHeader(
				"HX-Trigger-After-Settle",
				typeof event === "string" ? event : JSON.stringify(event),
			);
		}
	}

	htmxPush(url: string | false): void {
		if (this.isHtmx) {
			this.raw.setHeader("HX-Push-Url", url === false ? "false" : url);
		}
	}

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
	): void {
		if (this.isHtmx) {
			this.raw.setHeader("HX-Reswap", strategy);
		}
	}

	htmxReplaceUrl(url: string | false): void {
		if (this.isHtmx) {
			this.raw.setHeader("HX-Replace-Url", url === false ? "false" : url);
		}
	}

	htmxRetarget(selector: string): void {
		if (this.isHtmx) {
			this.raw.setHeader("HX-Retarget", selector);
		}
	}

	htmxReselect(selector: string): void {
		if (this.isHtmx) {
			this.raw.setHeader("HX-Reselect", selector);
		}
	}

	htmxRefresh(): void {
		if (this.isHtmx) {
			this.raw.setHeader("HX-Refresh", "true");
		}
	}

	htmxRedirect(url: string): void {
		if (this.isHtmx) {
			this.raw.setHeader("HX-Redirect", url);
		}
	}

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
	): void {
		if (this.isHtmx) {
			this.raw.setHeader(
				"HX-Location",
				typeof location === "string" ? location : JSON.stringify(location),
			);
		}
	}

	private normalizeSetCookieHeader(
		header: string | string[] | number | undefined,
	) {
		if (Array.isArray(header)) {
			return header.filter(
				(value): value is string => typeof value === "string",
			);
		}

		if (typeof header === "string") {
			return [header];
		}

		return [];
	}

	private getSetCookieName(cookieHeader: string) {
		if (!this.cookieModule) {
			return "";
		}

		try {
			return this.cookieModule.parseSetCookie(cookieHeader).name;
		} catch {
			return "";
		}
	}

	end(value?: unknown) {
		this.raw.end(value);
	}
}

export type { CookieModule };
