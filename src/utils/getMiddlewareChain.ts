/**
 * Lynnix
 * File-based hypermedia routing middleware for Node.js, Mutor.js, and HTMX.
 *
 * @author Onah Victor <victoronah.dev@gmail.com>
 * @repository https://github.com/allAboutJS/Lynnix
 * @license MIT
 */

import type { RoutesMap } from "../types.js";

/**
 * Recursively extracts the middleware chain for a given route
 *
 * @param route The route to extract the middleware chain for
 * @param routesMap A map of routes to middleware functions
 * @param chain The middleware chain to build (default: [])
 * @returns The middleware chain for the given route
 */
export default function getMiddlewareChain(
	route: string,
	routesMap: RoutesMap,
	chain: string[] = [],
) {
	if (route === "/") {
		if (routesMap[route].middleware) {
			chain.unshift(routesMap[route].middleware);
		}

		return chain;
	}

	if (routesMap[route]?.middleware) {
		chain.unshift(routesMap[route].middleware);
	}

	const routesChunks = route.split("/").filter(Boolean);
	routesChunks.pop();

	return getMiddlewareChain(`/${routesChunks.join("/")}`, routesMap, chain);
}
