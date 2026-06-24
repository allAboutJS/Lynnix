# Lynnix

**File-based routing for htmx, powered by Mutor.js.**

Lynnix is a lightweight, framework-agnostic routing and SSR middleware for Node.js that makes building htmx applications feel natural. Drop your files in the right place, export a function, and Lynnix handles the rest — routing, rendering, middleware chains, htmx-aware responses, and error boundaries, all wired together automatically.

No magic config files. No build step. Just a filesystem that speaks HTTP.

```js
import { createLynnixApp } from "lynnix";
import express from "express";

const app = express();
const handler = await createLynnixApp("app");

app.use(express.static("public"));
app.use(handler);
app.listen(3000);
```

That's it. Everything else comes from your files.

---

## Why Lynnix?

htmx is a breath of fresh air — it brings back the simplicity of server-rendered HTML without sacrificing interactivity. But as your application grows, wiring up routes, rendering templates, and managing partial responses by hand gets tedious fast.

Lynnix gives htmx applications the structure they deserve. It handles the routing and rendering layer so you can focus on what actually matters: building your product.

It's built on [Mutor.js](https://github.com/allAboutJS/Mutor.js) — a fast, TypeScript-native, zero-dependency template engine — so your templates are expressive, secure, and compiled for performance.

---

## Installation

```bash
npm install lynnix
```

Lynnix has a lean set of optional peer dependencies that unlock additional features:

| Package | What it unlocks |
|---|---|
| `cookie` | Cookie parsing and setting |
| `@fastify/busboy` | `multipart/form-data` and `application/x-www-form-urlencoded` body parsing |
| `body-parser` | `application/json` body parsing |
| `qs` | Advanced query string and URL-encoded body parsing |

Install only what you need. Lynnix will work without any of them and warn you in the console if a feature requires one that isn't installed.

---

## Getting Started

### With bare `node:http`

Lynnix works with Node's built-in HTTP server out of the box. For static files, pair it with [`send-static`](https://www.npmjs.com/package/send-static):

```js
import { createLynnixApp } from "lynnix";
import sendStatic from "send-static";
import * as http from "node:http";

async function main() {
  const serve = sendStatic("public", { index: false });
  const handle = await createLynnixApp("app");

  const server = http.createServer((req, res) => {
    serve(req, res, () => handle(req, res));
  });

  server.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
  });
}

main();
```

### With Express

```js
import { createLynnixApp } from "lynnix";
import express from "express";

async function main() {
  const app = express();
  const handler = await createLynnixApp("app");

  app.use(express.static("public"));
  app.use(handler);

  app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
  });
}

main();
```

### `createLynnixApp(path, mutorConfig?, bodyParserOptions?)`

| Parameter | Type | Description |
|---|---|---|
| `path` | `string` | The root directory of your application (e.g. `"app"`) |
| `mutorConfig` | `PartialMutorConfig` | Optional Mutor.js configuration (excluding `rootDir`) |
| `bodyParserOptions` | `ParseReqBodyOptions` | Optional body parser limits and settings |

Returns a standard `(req, res) => void` request handler you can mount anywhere.

---

## Project Structure

A Lynnix application lives inside a single directory (conventionally `app/`). The filesystem is your router.

```
app/
├── components/
│   └── header.html
├── dashboard/
│   ├── posts/
│   │   ├── [slug]/
│   │   │   └── loader.js
│   │   ├── loader.js
│   │   └── page.html
│   ├── layout.html
│   ├── loader.js
│   ├── middleware.js
│   ├── not-found.html
│   └── page.html
├── loader.js
├── not-found.html
└── page.html
```

Each directory maps to a route. The files inside determine how that route behaves.

---

## File Conventions

These are the reserved filenames Lynnix recognises in any route directory:

| File | Purpose |
|---|---|
| `page.html` | Full-page HTML response for regular requests |
| `fragment.html` | Partial HTML response for htmx requests |
| `loader.js` / `loader.ts` | HTTP method handlers and data loading |
| `middleware.js` / `middleware.ts` | Route-level middleware |
| `not-found.html` | 404 page for regular requests |
| `fragment.not-found.html` | 404 fragment for htmx requests |
| `error.html` | Error page for regular requests |
| `fragment.error.html` | Error fragment for htmx requests |

Any other file (components, utilities, layouts) is invisible to the router and can be named freely.

---

## Routing

### Static Routes

A directory named `about` maps to `/about`. Nest them as deep as you like.

```
app/
├── about/
│   └── page.html       → /about
├── blog/
│   └── page.html       → /blog
└── page.html           → /
```

### Dynamic Routes

Wrap a directory name in square brackets to create a dynamic segment. The captured value is available in your loader as `req.params`.

```
app/
└── posts/
    ├── [slug]/
    │   ├── loader.js
    │   └── page.html   → /posts/:slug
    └── page.html       → /posts
```

```js
// app/posts/[slug]/loader.js
export function GET(req) {
  const { slug } = req.params;
  const post = db.posts.find(slug);
  return { post };
}
```

### Catch-All Routes

Double brackets capture every path segment from that point onward. Use this for wildcard pages, CMS-driven routes, or custom 404 experiences.

```
app/
└── [[slug]]/
    ├── loader.js
    └── page.html       → matches /anything, /a/b/c, /a/b/c/d ...
```

The entire remaining path is available as a string in `req.params`:

```js
// app/[[slug]]/loader.js
export function GET(req) {
  const { slug } = req.params; // e.g. "docs/getting-started/installation"
  return { slug };
}
```

### Route Priority

When multiple routes could match the same path, Lynnix resolves the conflict by **specificity** — the more concrete a route is, the higher its priority. Specificity is determined by three factors in order:

**1. Tier** — Static routes always beat dynamic routes, which always beat catch-all routes.

**2. Static segment count** — Within the same tier, routes with more concrete (non-dynamic) segments win. `/posts/featured` has two static segments and beats `/posts/[slug]` which has one. `/[category]/featured` has one static segment and beats `/[category]/[slug]` which has none.

**3. Depth** — When two routes in the same tier have the same number of static segments, shallower routes win for static and dynamic routes (less ambiguous), while deeper routes win for catch-all routes (a more constrained prefix is more specific).

A few examples to make it concrete:

| Path | Matches |
|---|---|
| `/posts/featured` | `/posts/featured` — static wins |
| `/posts/hello-world` | `/posts/[slug]` — dynamic picks it up |
| `/electronics/featured` | `/[category]/featured` — more static segments wins |
| `/electronics/some-product` | `/[category]/[slug]` — falls through to two-dynamic route |
| `/posts/a/b/c` | `/posts/[[slug]]` — deeper catch-all prefix beats shallower |
| `/anything/goes/here` | `/[[slug]]` — root catch-all is the last resort |

You never have to think about this ordering explicitly — Lynnix sorts your routes at startup so the right one always wins.

---

## Loaders

A `loader.js` file exports named functions matching the HTTP methods they handle. Method names are uppercased.

```js
// app/posts/loader.js
export function GET(req, res) {
  return { posts: db.posts.all() };
}

export function POST(req, res) {
  const { title, content } = req.body;
  db.posts.create({ title, content });
  res.redirect("/posts");
}

export function DELETE(req, res) {
  db.posts.delete(req.params.slug);
  res.status(200).end();
}
```

Whatever you return from a loader becomes `data` in your template:

```html
<!-- app/posts/page.html -->
{{ for post of data.posts }}
<article>
  <h2>{{ post.title }}</h2>
</article>
{{ endfor }}
```

If the response has already been ended inside the loader (via `res.redirect()`, `res.end()`, etc.), Lynnix skips rendering entirely. If a route has no loader, non-GET requests return `405 Method Not Allowed` automatically.

---

## Middleware

A `middleware.js` file exports a single default function. It runs before the loader on every request to that route and all routes nested beneath it.

```js
// app/dashboard/middleware.js
import { users } from "../lib/users.js";

export default function dashboardMiddleware(req, res) {
  const userId = req.cookies.auth;

  if (!userId) {
    res.redirect("/sign-in");
    return;
  }

  const user = users.find((u) => u.id === userId);

  if (!user) {
    res.redirect("/sign-in");
    return;
  }

  req.user = user;
}
```

**Middleware chains run top-down** — from the root of your app to the matched route. A middleware at `app/middleware.js` runs on every request. A middleware at `app/dashboard/middleware.js` runs on every request under `/dashboard`. If any middleware ends the response, the chain stops and the loader never runs.

There is no `next` function. Returning from the middleware function is enough to continue.

---

## Layouts

Layouts let you define a reusable HTML shell and inject page content into it. They're a Mutor.js feature that Lynnix makes available across your entire application.

### Declaring a Layout

Any template that starts with `{{# layout "name" }}` is registered as a named layout at startup. The `{{ ::slot }}` tag marks where page content gets injected.

```html
<!-- app/dashboard/layout.html -->
{{# layout "dashboard_layout" }}

<!doctype html>
<html lang="en">
  <head>
    <title>{{ data.title }}</title>
  </head>
  <body>
    <aside><!-- sidebar --></aside>
    <main>{{ ::slot }}</main>
  </body>
</html>
```

### Using a Layout

Any page or fragment that starts with `{{# use "name" }}` is rendered inside that layout. No boilerplate, no repeated markup.

```html
<!-- app/dashboard/page.html -->
{{# use "dashboard_layout" }}

<h1>Welcome, {{ data.user.name }}</h1>
```

The filename doesn't matter to Lynnix — `layout.html` is just a convention. What matters is the `{{# layout }}` declaration inside the file.

---

## Fragments (htmx Partial Rendering)

When htmx makes a request, it sends an `HX-Request: true` header. Lynnix detects this automatically and renders `fragment.html` instead of `page.html`, giving you clean partial responses without any conditional logic in your loader.

```html
<!-- app/posts/fragment.html -->
<div id="posts-list">
  {{ for post of data.posts }}
  <article>{{ post.title }}</article>
  {{ endfor }}
</div>
```

Your loader doesn't need to change — the same return value feeds both `page.html` and `fragment.html`. If a route has no `fragment.html`, Lynnix returns an empty `200` for htmx requests.

You can also check `req.isHtmx` in your loader if you need to branch on request type:

```js
export function GET(req) {
  if (!req.isHtmx) {
    return { title: "Posts", posts: db.posts.all() };
  }

  return { posts: db.posts.all() };
}
```

---

## Error Handling

### Not Found

Throw a `NotFoundError` from any loader or middleware to render the nearest `not-found.html` boundary up the directory tree.

```js
import { NotFoundError } from "lynnix";

export function GET(req) {
  const post = db.posts.find(req.params.slug);

  if (!post) {
    throw new NotFoundError();
  }

  return { post };
}
```

For htmx requests, Lynnix serves `fragment.not-found.html` instead. If no boundary is found, Lynnix returns a plain `404`.

### HTTP Errors

Throw an `HttpError` with a status code and optional metadata for any other error scenario.

```js
import { HttpError } from "lynnix";

export function GET(req) {
  if (!req.user.isAdmin) {
    throw new HttpError(403, { message: "Admins only" });
  }
}
```

In your error template, you have access to `{{ error }}`, `{{ pathname }}`, and `{{ data }}` (the metadata you passed in).

```html
<!-- app/error.html -->
<h1>{{ error.code }}</h1>
<p>{{ data.message }}</p>
```

### Boundary Resolution

Lynnix walks up the directory tree from the current route to find the nearest error or not-found boundary. This means a `not-found.html` at `app/dashboard/not-found.html` catches 404s for any unmatched route under `/dashboard`, while `app/not-found.html` serves as the global fallback.

---

## Request API

The `req` object passed to loaders and middleware implements `LynnixServerRequest`:

| Property | Type | Description |
|---|---|---|
| `req.raw` | `http.IncomingMessage` | The underlying Node.js request object |
| `req.body` | `Record<string, unknown>` | Parsed request body |
| `req.files` | `LynnixUploadedFiles` | Uploaded files (multipart only) |
| `req.cookies` | `Record<string, string>` | Parsed request cookies (requires `cookie`) |
| `req.params` | `Record<string, string>` | Dynamic and catch-all route parameters |
| `req.query` | `Record<string, unknown>` | Parsed query string |
| `req.htmx` | `Record<string, string>` | All `hx-*` request headers |
| `req.isHtmx` | `boolean` | `true` if the request was made by htmx |

---

## Response API

The `res` object passed to loaders and middleware implements `LynnixServerResponse`:

### Core

| Method | Description |
|---|---|
| `res.status(code)` | Set the HTTP status code. Returns `this` for chaining. |
| `res.end(value?)` | End the response, optionally with a body. |
| `res.html(content)` | Send an HTML response with the correct `Content-Type`. |
| `res.json(content)` | Send a JSON response with the correct `Content-Type`. |
| `res.redirect(url, permanent?)` | Redirect the client. htmx-aware — sets `HX-Redirect` for htmx requests. Pass `true` for a `301` permanent redirect. |

### Cookies

| Method | Description |
|---|---|
| `res.setCookie(name, value, options)` | Set a cookie. Requires the `cookie` peer dependency. |
| `res.deleteCookie(name)` | Delete a cookie by setting it as expired. Requires the `cookie` peer dependency. |
| `res.cookies` | The current response cookies as a plain object. |

### htmx Response Headers

These methods are no-ops for non-htmx requests, so you can call them freely without checking `req.isHtmx`.

| Method | Description |
|---|---|
| `res.htmxTrigger(event)` | Trigger a client-side event via `HX-Trigger`. |
| `res.htmxTriggerAfterSwap(event)` | Trigger an event after the swap via `HX-Trigger-After-Swap`. |
| `res.htmxTriggerAfterSettle(event)` | Trigger an event after settle via `HX-Trigger-After-Settle`. |
| `res.htmxPush(url)` | Push a URL to the browser history via `HX-Push-Url`. Pass `false` to prevent pushing. |
| `res.htmxReplaceUrl(url)` | Replace the current URL via `HX-Replace-Url`. |
| `res.htmxRedirect(url)` | Client-side redirect via `HX-Redirect`. |
| `res.htmxLocation(location)` | Navigate without a full page reload via `HX-Location`. |
| `res.htmxReswap(strategy)` | Override the swap strategy via `HX-Reswap`. |
| `res.htmxRetarget(selector)` | Override the target element via `HX-Retarget`. |
| `res.htmxReselect(selector)` | Override the select expression via `HX-Reselect`. |
| `res.htmxRefresh()` | Trigger a full page refresh via `HX-Refresh`. |

### Raw Access

`res.raw` gives you direct access to the underlying `http.ServerResponse` for anything Lynnix doesn't cover.

---

## Framework Integration

Lynnix needs two things from the framework you're using: a request object with `headers` and a response object with `end` and `setHeader`. Anything that provides those works.

The `req.raw` and `res.raw` escape hatches expose the underlying objects directly. Any code that touches `.raw` is framework-specific — keep that in mind when writing loaders you want to stay portable.

### Express

Express works out of the box. Mount Lynnix as middleware after your static file and body parser middleware.

```js
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(await createLynnixApp("app"));
```

> **Note:** If you're using Express's body parsing middleware, Lynnix's built-in body parser will defer to it automatically. You don't need both.

### Bare `node:http`

Use `send-static` for static files and let Lynnix handle everything else. See [Getting Started](#getting-started).

### Fastify

Fastify's `reply` object exposes `reply.raw` for the underlying `ServerResponse`. Pass `req.raw` and `reply.raw` to the Lynnix handler:

```js
fastify.all("/*", (req, reply) => {
  handler(req.raw, reply.raw);
});
```

Cookie handling differs between frameworks — if you're using Fastify, install `@fastify/cookie` and set cookies via `res.raw` directly, or use Lynnix's built-in `res.setCookie` with the `cookie` peer dependency.

---

## Built With

- [Mutor.js](https://github.com/allAboutJS/Mutor) — the template engine powering Lynnix's rendering layer
- [htmx](https://htmx.org) — the hypermedia library Lynnix is designed around

---

## License

MIT © [Onah Victor](https://github.com/allAboutJS)
