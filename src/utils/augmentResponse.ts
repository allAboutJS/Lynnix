/**
 * Lynnix
 * File-based hypermedia routing middleware for Node.js, Mutor.js, and HTMX.
 *
 * @author Onah Victor <victoronah.dev@gmail.com>
 * @repository https://github.com/allAboutJS/Lynnix
 * @license MIT
 */

import type * as http from "node:http";
import LynnixResponse from "./lynnixResponse.js";

/**
 * Augments the response object with utility methods.
 *
 * @param res The raw response object
 */
export default async function augmentResponse(
	res: http.ServerResponse<http.IncomingMessage>,
	isHtmx: boolean,
) {
	// Prevent caching for HTMX requests
	if (isHtmx) {
		res.setHeader("Vary", "HX-Request");
		res.setHeader("Cache-Control", "no-store");
	}

	return new LynnixResponse(res, isHtmx);
}
