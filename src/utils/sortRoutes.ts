/**
 * Lynnix
 * File-based hypermedia routing middleware for Node.js, Mutor.js, and HTMX.
 *
 * @author Onah Victor <victoronah.dev@gmail.com>
 * @repository https://github.com/allAboutJS/Lynnix
 * @license MIT
 */

/**
 * Sorts an array of routes, placing static routes before dynamic routes.
 *
 * @param routes An array of routes to sort.
 * @returns The sorted array of routes.
 */
export function sortRoutes(routes: string[]) {
	const isCatchAll = (route: string) => /\[\[.*\]\]/.test(route);
	const isDynamic = (route: string) => /\[.*\]/.test(route);
	const depth = (route: string) => route.split("/").filter(Boolean).length;
	const staticCount = (route: string) =>
		route.split("/").filter((seg) => seg && !/^\[/.test(seg)).length;

	return routes.sort((a, b) => {
		const aCatchAll = isCatchAll(a);
		const bCatchAll = isCatchAll(b);

		if (aCatchAll !== bCatchAll) {
			return aCatchAll ? 1 : -1;
		}

		const aDynamic = isDynamic(a);
		const bDynamic = isDynamic(b);

		if (aDynamic !== bDynamic) {
			return aDynamic ? 1 : -1;
		}

		// Within catch-all tier: deeper prefix is more specific, wins
		if (aCatchAll) {
			return depth(b) - depth(a);
		}

		// Within static/dynamic tier: more static segments = more specific, wins
		const staticDiff = staticCount(b) - staticCount(a);

		if (staticDiff !== 0) {
			return staticDiff;
		}

		// Same static segment count: shallower wins
		return depth(a) - depth(b);
	});
}
