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
import type { NotFoundError } from "./error.js";
import findClosestBoundary from "./findClosestBoundary.js";
import type LRUCache from "./lruCache.js";

export function handleNotFound(
	res: LynnixServerResponse,
	mutor: Mutor,
	cache: LRUCache<string, Partial<Record<BoundaryKey, string>>>,
	{
		pathname,
		isHtmxReq,
		routes,
		routesMap,
		data,
		error,
		route,
	}: {
		pathname: string;
		isHtmxReq: boolean;
		routesMap: RoutesMap;
		routes: string[];
		data?: unknown;
		error: NotFoundError;
		route: string;
	},
) {
	const boundaryKey = isHtmxReq ? "fragmentNotFound" : "notFound";
	const cacheKey = `${route}:${boundaryKey}`;

	const nearestNotFound =
		cache.get(cacheKey) ??
		findClosestBoundary(pathname, boundaryKey, routes, routesMap);

	if (!nearestNotFound?.[boundaryKey]) {
		res.status(404).end();
		return;
	}

	if (!cache.has(cacheKey)) {
		cache.set(cacheKey, nearestNotFound);
	}

	const html = mutor.renderFile(nearestNotFound[boundaryKey], {
		path: pathname,
		data: data || {},
		error: error,
	});

	res.status(404).html(html);
}
