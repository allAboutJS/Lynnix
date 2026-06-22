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
import type {
	BoundaryKey,
	LynnixServerResponse,
	ParseReqBodyOptions,
} from "./types.js";
import augmentRequest from "./utils/augmentRequest.js";
import augmentResponse from "./utils/augmentResponse.js";
import buildRoutes from "./utils/buildRoutesMap.js";
import { HttpError, NotFoundError } from "./utils/error.js";
import findClosestBoundary from "./utils/findClosestBoundary.js";
import getMiddlewareChain from "./utils/getMiddlewareChain.js";
import { handleHttpError } from "./utils/handleHttpError.js";
import { handleNotFound } from "./utils/handleNotFound.js";
import LRUCache from "./utils/lruCache.js";
import matchRoute from "./utils/matchRoute.js";
import parseReqBody from "./utils/parseReqBody.js";
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

	const BOUNDARY_CACHE = new LRUCache<
		string,
		Partial<Record<BoundaryKey, string>>
	>();

	const MATCHED_ROUTES_CACHE = new LRUCache<
		string,
		{ params: Record<string, string>; route: string }
	>();

	const mutor = new Mutor({ rootDir: path, ...mutorConfig });
	const routesMap = await buildRoutes(path);
	const sortedRoutes = sortRoutes(Object.keys(routesMap));

	// Add layouts from the root directory
	await mutor.addLayoutsInDir(path);

	return async (_req: http.IncomingMessage, _res: LynnixServerResponse) => {
		const isHtmxReq = _req.headers["hx-request"] === "true";

		// Augment the request and response objects
		const req = await augmentRequest(_req);
		const res = await augmentResponse(_res, isHtmxReq);

		const { url } = req;
		if (!url) {
			return res.end();
		}

		const { pathname } = new URL(
			url,
			`http://${req.headers.host ?? "localhost"}`,
		);

		const match =
			MATCHED_ROUTES_CACHE.get(pathname) ?? matchRoute(pathname, sortedRoutes);

		if (!match) {
			handleNotFound(res, mutor, BOUNDARY_CACHE, {
				pathname,
				isHtmxReq,
				routesMap,
				routes: sortedRoutes,
				error: new NotFoundError(),
				route: "/", // Default to root since no routes match the path
			});
			return;
		}

		// Will be populated by the loader
		let data: unknown;

		try {
			req.params = match?.params ?? {};
			await parseReqBody(req, res, bodyParserOptions);

			// Cache the match to avoid recomputing it on subsequent requests
			if (!MATCHED_ROUTES_CACHE.has(pathname)) {
				MATCHED_ROUTES_CACHE.set(pathname, match);
			}

			const middlewareChain = getMiddlewareChain(match.route, routesMap);
			const loaderPath = routesMap[match.route].loader;

			for (let i = 0; i < middlewareChain.length; i++) {
				const middlewarePath = middlewareChain[i];
				const mod = await import(pathToFileURL(middlewarePath).href);

				if (typeof mod?.default !== "function") {
					continue;
				}

				await mod.default(req, res);

				if (res.writableEnded) {
					return;
				}
			}

			if (loaderPath) {
				const mod = await import(pathToFileURL(loaderPath).href);
				const method = req.method?.toUpperCase() ?? "GET";
				const handler = mod[method];

				if (typeof handler !== "function") {
					// Stop non GET requests from completing without a loader for the request
					if (method !== "GET") {
						res.status(405).end();
						return;
					}
				} else {
					data = await handler(req, res);
				}

				if (res.writableEnded) {
					return;
				}
			}
		} catch (err) {
			if (err instanceof HttpError) {
				handleHttpError(res, mutor, BOUNDARY_CACHE, {
					isHtmxReq,
					pathname,
					routesMap,
					routes: sortedRoutes,
					data: err.meta,
					code: err.code,
					error: err,
					route: match.route,
				});

				return;
			}

			if (err instanceof NotFoundError) {
				handleNotFound(res, mutor, BOUNDARY_CACHE, {
					isHtmxReq,
					pathname,
					routesMap,
					routes: sortedRoutes,
					data: err.meta,
					error: err,
					route: match.route,
				});

				return;
			}

			const boundaryKey = isHtmxReq ? "fragmentError" : "error";
			const nearestError =
				BOUNDARY_CACHE.get(`${match.route}:${boundaryKey}`) ??
				findClosestBoundary(pathname, boundaryKey, sortedRoutes, routesMap);

			if (!nearestError?.error) {
				res.status(500).end();
				return;
			}

			// Cache the nearest error to avoid recomputing it on subsequent requests
			if (!BOUNDARY_CACHE.has(`${match.route}:${boundaryKey}`)) {
				BOUNDARY_CACHE.set(`${match.route}:${boundaryKey}`, nearestError);
			}

			const html = mutor.renderFile(nearestError[boundaryKey], {
				error: err,
				pathname,
			});

			res.status(500).html(html);
			return;
		}

		// ALL MIDDLEWARE AND LOADER RAN SUCCESSFULLY
		// RENDER THE RESPONSE

		if (isHtmxReq) {
			const fragmentPath = routesMap[match.route].fragment;

			if (!fragmentPath) {
				res.status(200).end();
				console.log(
					`[Lynnix] No fragment.html was provided for the route ${match.route}`,
				);
				return;
			}

			const html = mutor.renderFile(fragmentPath, {
				data,
				isHtmxReq,
				url: pathname,
			});

			res.status(200).html(html);
			return;
		}

		const pagePath = routesMap[match.route].page;

		if (!pagePath) {
			res.end();
			console.log(
				`[Lynnix] No page.html was provided for the route ${match.route}`,
			);
			return;
		}

		const html = mutor.renderFile(pagePath, {
			data,
			url: pathname,
		});

		res.status(200).html(html);
	};
}
