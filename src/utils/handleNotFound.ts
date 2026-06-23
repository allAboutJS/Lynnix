/**
 * Lynnix
 * File-based hypermedia routing middleware for Node.js, Mutor.js, and HTMX.
 *
 * @author Onah Victor <victoronah.dev@gmail.com>
 * @repository https://github.com/allAboutJS/Lynnix
 * @license MIT
 */

import type Mutor from "mutorjs/server";
import type { RoutesMap } from "../types.js";
import { HttpError, NotFoundError } from "./error.js";
import findClosestBoundary from "./findClosestBoundary.js";
import { handleHttpError } from "./handleHttpError.js";
import type LynnixRequest from "./lynnixRequest.js";
import type LynnixResponse from "./lynnixResponse.js";
import runMiddlewares from "./runMiddlewares.js";

/**
 * Handles the not found error by finding the closest boundary and
 * optionally running middlewares before rendering the not found page.
 *
 * @param param0 An object containing the request, response, and other context.
 * @param shouldRunMiddlewares Specifies whether to run middlewares before rendering the not found page.
 * @returns
 */
export async function handleNotFound(
	{
		req,
		res,
		mutor,
		isHtmxReq,
		routesMap,
		routes,
		pathname,
		data,
		error,
	}: {
		res: LynnixResponse;
		req: LynnixRequest;
		mutor: Mutor;
		isHtmxReq: boolean;
		routes: string[];
		routesMap: RoutesMap;
		pathname: string;
		data?: unknown;
		error: NotFoundError;
	},
	shouldRunMiddlewares?: boolean,
) {
	const boundary = isHtmxReq ? "fragmentNotFound" : "notFound";
	const nearestNotFound = findClosestBoundary(
		pathname,
		boundary,
		routes,
		routesMap,
	);

	// Run middlewares optionally
	if (shouldRunMiddlewares) {
		try {
			await runMiddlewares(
				req,
				res,
				nearestNotFound?.accessedRoute || "/",
				routesMap,
			);
		} catch (err) {
			if (err instanceof NotFoundError) {
				await handleNotFound({
					req,
					res,
					mutor,
					isHtmxReq,
					routesMap,
					routes,
					pathname,
					data,
					error: err,
				});

				return;
			}

			handleHttpError({
				res,
				mutor,
				isHtmxReq,
				routesMap,
				routes,
				pathname,
				data,
				code: 500,
				error: err instanceof HttpError ? err : new HttpError(500, err),
			});

			return;
		}
	}

	if (res.raw.writableEnded) {
		return;
	}

	if (!nearestNotFound?.paths?.[boundary]) {
		return res.status(404).html("");
	}

	const html = mutor.renderFile(nearestNotFound.paths[boundary], {
		error,
		data: data || {},
		pathname,
	});

	res.status(404).html(html);
}
