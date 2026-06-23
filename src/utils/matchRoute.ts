/**
 * Lynnix
 * File-based hypermedia routing middleware for Node.js, Mutor.js, and HTMX.
 *
 * @author Onah Victor <victoronah.dev@gmail.com>
 * @repository https://github.com/allAboutJS/Lynnix
 * @license MIT
 */

/**
 * Matches a given path against a list of routes and returns the matching route and parameters.
 *
 * @param path The path to match against the routes.
 * @param routes The list of routes to match against.
 * @returns The matching route and parameters, or null if no match is found.
 */
export default function matchRoute(path: string, routes: string[]) {
	if (path === "/") {
		return routes.includes("/") ? { params: {}, route: "/" } : null;
	}

	const pathChunks = path.split("/").filter(Boolean);

	outer: for (let i = 0; i < routes.length; i++) {
		const params: Record<string, string> = {};
		const route = routes[i];
		const routeChunks = route.split("/").filter(Boolean);
		let isMatch = true;

		const isCatchAll = routeChunks.some((chunk) => /^\[\[.+\]\]$/.test(chunk));

		if (!isCatchAll && pathChunks.length !== routeChunks.length) {
			continue;
		}

		for (let j = 0; j < routeChunks.length; j++) {
			const routeChunk = routeChunks[j];
			const pathChunk = pathChunks[j];

			if (/^\[\[.+\]\]$/.test(routeChunk)) {
				params[routeChunk.slice(2, -2)] = pathChunks
					.slice(j)
					.map(decodeURIComponent)
					.join("/");
				return { params, route };
			}

			if (/^\[.+\]$/.test(routeChunk)) {
				params[routeChunk.slice(1, -1)] = decodeURIComponent(pathChunk);
				continue;
			}

			if (routeChunk !== pathChunk) {
				isMatch = false;
				continue outer;
			}
		}

		if (isMatch) {
			return { params, route };
		}
	}

	return null;
}
