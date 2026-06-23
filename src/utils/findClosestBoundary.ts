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
): { paths: RoutesMap[string]; accessedRoute: string } | null {
	// Find the boundary at the root level if it exists
	if (path === "/") {
		const routeEntry = routesMap["/"];
		return routeEntry?.[key] ? { paths: routeEntry, accessedRoute: "/" } : null;
	}

	const match = matchRoute(path, routes);

	if (match) {
		const matchedBoundary = routesMap[match.route][key];

		// Routes are pre-sorted (static before dynamic at equal depth), so matchRoute
		// will never return a dynamic sibling over a static match.
		if (matchedBoundary) {
			return { paths: routesMap[match.route], accessedRoute: match.route };
		}
	}

	const routeChunks = path.split("/").filter(Boolean);

	routeChunks.pop();

	return findClosestBoundary(
		`/${routeChunks.join("/")}`,
		key,
		routes,
		routesMap,
	);
}
