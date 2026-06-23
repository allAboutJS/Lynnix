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
	Cookies,
	HtmxHeaders,
	LynnixServerRequest,
	LynnixUploadedFiles,
} from "../types.js";

export default class LynnixRequest implements LynnixServerRequest {
	body: Record<string, unknown> = {};
	files: LynnixUploadedFiles = {};
	cookies: Cookies = {};
	query: LynnixServerRequest["query"] = {};
	params: Record<string, string | undefined> = {};
	htmx: HtmxHeaders = {} as HtmxHeaders;
	isHtmx = false;

	constructor(public readonly raw: http.IncomingMessage) {}
}
