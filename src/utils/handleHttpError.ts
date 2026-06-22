/**
 * Lynnix
 * File-based hypermedia routing middleware for Node.js, Mutor.js, and HTMX.
 *
 * @author Onah Victor <victoronah.dev@gmail.com>
 * @repository https://github.com/allAboutJS/Lynnix
 * @license MIT
 */

import type Mutor from "mutorjs/server";
import type { BoundaryKey, LynnixServerResponse, RoutesMap } from "../types.js";
import type { HttpError } from "./error.js";
import findClosestBoundary from "./findClosestBoundary.js";
import type LRUCache from "./lruCache.js";

export function handleHttpError(
	res: LynnixServerResponse,
	mutor: Mutor,
	cache: LRUCache<string, Partial<Record<BoundaryKey, string>>>,
	{
		pathname,
		isHtmxReq,
		routes,
		routesMap,
		data,
		code,
		error,
		route,
	}: {
		pathname: string;
		isHtmxReq: boolean;
		routesMap: RoutesMap;
		routes: string[];
		data?: unknown;
		code: number;
		error?: HttpError;
		route: string;
	},
) {
	const boundaryKey = isHtmxReq ? "fragmentError" : "error";
	const cacheKey = `${route}:${boundaryKey}`;

	const nearestNotFound =
		cache.get(cacheKey) ??
		findClosestBoundary(pathname, boundaryKey, routes, routesMap);

	if (!nearestNotFound?.[boundaryKey]) {
		res.status(code).end();
		return;
	}

	// Cache the nearest not found boundary for future requests
	if (!cache.has(cacheKey)) {
		cache.set(cacheKey, nearestNotFound);
	}

	const html = mutor.renderFile(nearestNotFound[boundaryKey], {
		path: pathname,
		data: data || {},
		error,
	});

	res.status(code).html(html);
}
