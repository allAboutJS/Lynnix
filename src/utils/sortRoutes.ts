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

	return routes.sort((a, b) => {
		const aCatchAll = isCatchAll(a);
		const bCatchAll = isCatchAll(b);

		if (aCatchAll && !bCatchAll) return 1;
		if (!aCatchAll && bCatchAll) return -1;

		const aDynamic = isDynamic(a);
		const bDynamic = isDynamic(b);

		if (!aDynamic && bDynamic) return -1;
		if (aDynamic && !bDynamic) return 1;

		return 0;
	});
}
