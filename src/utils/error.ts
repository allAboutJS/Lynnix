/**
 * Lynnix
 * File-based hypermedia routing middleware for Node.js, Mutor.js, and HTMX.
 *
 * @author Onah Victor <victoronah.dev@gmail.com>
 * @repository https://github.com/allAboutJS/Lynnix
 * @license MIT
 */

export class NotFoundError {
	constructor(public meta?: unknown) {}
}

export class HttpError {
	constructor(
		public code: number,
		public meta?: unknown,
	) {}
}
