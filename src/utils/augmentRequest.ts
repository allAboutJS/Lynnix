/**
 * Lynnix
 * File-based hypermedia routing middleware for Node.js, Mutor.js, and HTMX.
 *
 * @author Onah Victor <victoronah.dev@gmail.com>
 * @repository https://github.com/allAboutJS/Lynnix
 * @license MIT
 */

import * as cookie from "cookie";
import type * as http from "node:http";
import qs from "qs";
import type { LynnixServerRequest } from "../types.js";
import LynnixRequest from "./lynnixRequest.js";

export default async function augmentRequest(req: http.IncomingMessage) {
	const augmentedRequest = new LynnixRequest(req);
	const baseUrl = `http://${req.headers.host ?? "localhost"}`;

	augmentedRequest.cookies = cookie.parseCookie(req.headers.cookie ?? "");
	augmentedRequest.isHtmx = req.headers["hx-request"] === "true";
	augmentedRequest.htmx = Object.fromEntries(
		Object.entries(req.headers).filter(([k]) => k.startsWith("hx-")),
	) as LynnixServerRequest["htmx"];
	augmentedRequest.query = qs.parse(
		new URL(req.url ?? "", baseUrl).search.slice(1),
	);
	augmentedRequest.body = {};
	augmentedRequest.files = {};

	return augmentedRequest;
}
