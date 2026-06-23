/**
 * Lynnix
 * File-based hypermedia routing middleware for Node.js, Mutor.js, and HTMX.
 *
 * @author Onah Victor <victoronah.dev@gmail.com>
 * @repository https://github.com/allAboutJS/Lynnix
 * @license MIT
 */

import createLynnixApp from "./lynnix.js";

export type { MutorConfig, PartialMutorConfig } from "mutorjs/server";
export type {
	CookieOptions,
	HtmxHeaders,
	LynnixServerRequest,
	LynnixServerResponse,
	LynnixUploadedFiles,
	ParsedRequestBody,
	QsModule,
} from "./types.js";

export { HttpError, NotFoundError } from "./utils/error.js";
export { createLynnixApp };

export default createLynnixApp;
