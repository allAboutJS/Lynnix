/**
 * Lynnix
 * File-based hypermedia routing middleware for Node.js, Mutor.js, and HTMX.
 *
 * @author Onah Victor <victoronah.dev@gmail.com>
 * @repository https://github.com/allAboutJS/Lynnix
 * @license MIT
 */

import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { RoutesMap } from "../types.js";

const FILE_MAP = {
	"page.html": "page",
	"fragment.html": "fragment",
	"loader.js": "loader",
	"loader.ts": "loader",
	"error.html": "error",
	"not-found.html": "notFound",
	"fragment.not-found.html": "fragmentNotFound",
	"fragment.error.html": "fragmentError",
	"middleware.ts": "middleware",
	"middleware.js": "middleware",
} as const;

/**
 * Builds a file tree from the given path, recursively traversing directories and mapping file names to their full paths.
 *
 * @param path The root directory to build the file tree from.
 * @param baseRoute The base route for the file tree.
 * @param cache The cache to store the file tree.
 * @returns The file tree.
 */
export default async function buildRoutes(
	path: string,
	baseRoute = "/",
	cache: RoutesMap = {},
): Promise<RoutesMap> {
	for (const entry of await readdir(path, { withFileTypes: true })) {
		const fullPath = resolve(path, entry.name);

		if (entry.isDirectory()) {
			await buildRoutes(fullPath, `${baseRoute}/${entry.name}`, cache);
			continue;
		}

		const key = FILE_MAP[entry.name as keyof typeof FILE_MAP];

		if (!key) {
			continue;
		}

		const parsedBaseRoute = baseRoute.replace(/^\/\//, "/");

		cache[parsedBaseRoute] ??= {};
		cache[parsedBaseRoute][key] = fullPath;
	}

	return cache;
}
