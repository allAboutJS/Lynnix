import { pathToFileURL } from "node:url";
import type { RoutesMap } from "../types.js";
import getMiddlewareChain from "./getMiddlewareChain.js";
import type LynnixRequest from "./lynnixRequest.js";
import type LynnixResponse from "./lynnixResponse.js";

export default async function runMiddlewares(
	req: LynnixRequest,
	res: LynnixResponse,
	route: string,
	routesMap: RoutesMap,
) {
	const middlewareChain = getMiddlewareChain(route, routesMap);

	for (let i = 0; i < middlewareChain.length; i++) {
		const middlewarePath = middlewareChain[i];
		const mod = await import(pathToFileURL(middlewarePath).href);

		if (typeof mod?.default !== "function") {
			console.warn(
				`[Lynnix] Middleware at ${middlewarePath} is not a function`,
			);
			continue;
		}

		await mod.default(req, res);

		if (res.raw.writableEnded) {
			return;
		}
	}
}
