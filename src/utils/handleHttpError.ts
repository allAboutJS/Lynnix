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
import type { HttpError } from "./error.js";
import findClosestBoundary from "./findClosestBoundary.js";
import type LynnixResponse from "./lynnixResponse.js";

export function handleHttpError({
	res,
	mutor,
	pathname,
	isHtmxReq,
	routes,
	routesMap,
	data,
	code,
	error,
}: {
	code: number;
	error: HttpError;
	res: LynnixResponse;
	mutor: Mutor;
	isHtmxReq: boolean;
	routes: string[];
	routesMap: RoutesMap;
	pathname: string;
	data?: unknown;
}) {
	const boundary = isHtmxReq ? "fragmentError" : "error";
	const nearestError = findClosestBoundary(
		pathname,
		boundary,
		routes,
		routesMap,
	);

	if (!nearestError?.paths?.[boundary]) {
		return res.status(code).html("");
	}

	const html = mutor.renderFile(nearestError.paths[boundary], {
		error,
		data: data || {},
		pathname,
	});

	return res.status(code).html(html);
}
