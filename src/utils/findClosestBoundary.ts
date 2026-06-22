/**
 * Lynnix
 * File-based hypermedia routing middleware for Node.js, Mutor.js, and HTMX.
 *
 * @author Onah Victor <victoronah.dev@gmail.com>
 * @repository https://github.com/allAboutJS/Lynnix
 * @license MIT
 */

import type { BoundaryKey, RoutesMap } from "../types.js";
import matchRoute from "./matchRoute.js";

export default function findClosestBoundary(
	path: string,
	key: BoundaryKey,
	routes: string[],
	routesMap: RoutesMap,
	step = 0,
) {
	// Find the boundary at the root level if it exists
	if (path === "/") {
		const routeEntry = routesMap["/"];
		return routeEntry?.[key] ? routeEntry : null;
	}

	const match = matchRoute(path, routes);

	if (match) {
		const matchedBoundary = routesMap[match.route][key];

		if (/\[.*\]$/.test(match.route)) {
			// Match dynamic routes only if exact match
			if (step === 0 && matchedBoundary) {
				return routesMap[match.route];
			}
		} else if (matchedBoundary) {
			return routesMap[match.route];
		}
	}

	const routeChunks = path.split("/").filter(Boolean);

	routeChunks.pop();

	return findClosestBoundary(
		`/${routeChunks.join("/")}`,
		key,
		routes,
		routesMap,
		step + 1,
	);
}
