/**
 * Lynnix
 * File-based hypermedia routing middleware for Node.js, Mutor.js, and HTMX.
 *
 * @author Onah Victor <victoronah.dev@gmail.com>
 * @repository https://github.com/allAboutJS/Lynnix
 * @license MIT
 */

import type * as http from "node:http";
import { pathToFileURL } from "node:url";
import Mutor, { type PartialMutorConfig } from "mutorjs/server";
import type { ParseReqBodyOptions } from "./types.js";
import augmentRequest from "./utils/augmentRequest.js";
import augmentResponse from "./utils/augmentResponse.js";
import buildRoutes from "./utils/buildRoutesMap.js";
import { HttpError, NotFoundError } from "./utils/error.js";
import findClosestBoundary from "./utils/findClosestBoundary.js";
import { handleHttpError } from "./utils/handleHttpError.js";
import { handleNotFound } from "./utils/handleNotFound.js";
import LRUCache from "./utils/lruCache.js";
import matchRoute from "./utils/matchRoute.js";
import parseReqBody from "./utils/parseReqBody.js";
import runMiddlewares from "./utils/runMiddlewares.js";
import { sortRoutes } from "./utils/sortRoutes.js";

/**
 * @param path The root directory of the mutor instance
 * @returns A request handler function that serves the mutor instance
 * @example
 *
 * import createLynnixApp from "lynnix";
 * import * as http from "node:http";
 * import sendStatic from "serve-static";
 *
 * const handler = createLynnixApp("app");
 * const serve = serveStatic("./public", { index: false });
 *
 * const server = http.createServer((req, res) => {
 *    serve(req, res, () => handler(req, res));
 * });
 *
 * // OR
 *
 * import express from "express";
 *
 * const server = express();
 * const handler = createLynnixApp("app");
 *
 * server.use(express.urlencoded({ extended: true }));
 * server.use(express.json());
 * server.static("./public");
 *
 * server.use(handler);
 *
 * // FINALLY
 *
 * server.listen(3000);
 */
export default async function createLynnixApp(
	path: string,
	mutorConfig: Omit<PartialMutorConfig, "rootDir"> = {},
	bodyParserOptions: ParseReqBodyOptions = {},
) {
	if (!path || typeof path !== "string") {
		throw new Error("path must be a string");
	}

	const MATCHED_ROUTES_CACHE = new LRUCache<
		string,
		{ params: Record<string, string>; route: string }
	>();

	const mutor = new Mutor({ rootDir: path, ...mutorConfig });
	const routesMap = await buildRoutes(path);
	const sortedRoutes = sortRoutes(Object.keys(routesMap));

	// Add layouts from the root directory
	await mutor.addLayoutsInDir(path);

	return async (
		_req: http.IncomingMessage,
		_res: http.ServerResponse<http.IncomingMessage>,
	) => {
		const isHtmxReq = _req.headers["hx-request"] === "true";

		const req = await augmentRequest(_req);
		const res = await augmentResponse(_res, isHtmxReq);

		const { url } = req.raw;
		const method = req.raw.method?.toUpperCase() ?? "GET";

		if (!url) {
			return res.raw.end();
		}

		const { pathname } = new URL(
			url,
			`http://${req.raw.headers.host ?? "localhost"}`,
		);

		let match = MATCHED_ROUTES_CACHE.get(pathname);

		if (!match) {
			match = matchRoute(pathname, sortedRoutes);

			if (match) {
				MATCHED_ROUTES_CACHE.set(pathname, match);
			}
		}

		try {
			if (!match) {
				await handleNotFound(
					{
						req,
						res,
						mutor,
						isHtmxReq,
						routes: sortedRoutes,
						routesMap,
						pathname,
						error: new NotFoundError(),
					},
					true, // Run the middleware stack
				);
				return;
			}

			let data: unknown;

			req.params = match.params;
			await parseReqBody(req, res, bodyParserOptions);

			await runMiddlewares(req, res, match.route, routesMap);

			// If the response has already been ended, skip the loader and return early
			if (res.raw.writableEnded) {
				return;
			}

			const loaderPath = routesMap[match.route].loader;

			if (loaderPath) {
				const mod = await import(pathToFileURL(loaderPath).href);
				const handler = mod[method];

				if (typeof handler === "function") {
					data = await handler(req, res);
				} else {
					if (method !== "GET") {
						if (process.env.NODE_ENV !== "production") {
							console.error(
								`[Lynnix] No ${method} handler found for the route '${match.route}'`,
							);
						}

						throw new HttpError(405);
					}
				}

				if (res.raw.writableEnded) {
					return;
				}
			} else {
				// Return 405 for non-GET requests if no loader is found
				if (method !== "GET") {
					if (process.env.NODE_ENV !== "production") {
						console.error(
							`[Lynnix] No loader found to handle ${method} requests for the route '${match.route}'`,
						);
					}

					throw new HttpError(405);
				}
			}

			// Loaders and middleware completed successfully.

			if (isHtmxReq) {
				const fragmentPath = routesMap[match.route].fragment;

				if (!fragmentPath) {
					// Log a warning in non-production mode
					if (process.env.NODE_ENV !== "production") {
						console.warn(
							`[Lynnix] No fragment.html found for the route '${match.route}'`,
						);
					}

					return res.status(200).html("");
				}

				const html = mutor.renderFile(fragmentPath, {
					data,
					url: pathname,
				});

				return res.status(200).html(html);
			}

			const pagePath = routesMap[match.route].page;

			if (!pagePath) {
				throw new NotFoundError();
			}

			const html = mutor.renderFile(pagePath, {
				data,
				url: pathname,
			});

			res.status(200).html(html);
		} catch (err) {
			if (err instanceof HttpError) {
				handleHttpError({
					res,
					mutor,
					isHtmxReq,
					pathname,
					routesMap,
					routes: sortedRoutes,
					data: err.meta,
					code: err.code,
					error: err,
				});

				return;
			}

			if (err instanceof NotFoundError) {
				handleNotFound({
					res,
					req,
					mutor,
					isHtmxReq,
					pathname,
					routesMap,
					routes: sortedRoutes,
					data: err.meta,
					error: err,
				});

				return;
			}

			const boundaryKey = isHtmxReq ? "fragmentError" : "error";
			const nearestError = findClosestBoundary(
				pathname,
				boundaryKey,
				sortedRoutes,
				routesMap,
			);

			if (!nearestError?.paths?.[boundaryKey]) {
				res.status(isHtmxReq ? 200 : 500);
				return isHtmxReq ? res.html("") : res.raw.end();
			}

			const html = mutor.renderFile(nearestError.paths[boundaryKey], {
				error: err,
				url: pathname,
			});

			return res.status(isHtmxReq ? 200 : 500).html(html);
		}
	};
}
