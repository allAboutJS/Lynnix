# Changelog

All notable changes to this project will be documented in this file.

## [0.0.6] - 2026-06-30
## [0.0.5] - 2026-06-30

### Changed
- `qs` and `cookie` are now bundled dependencies instead of peer dependencies.
- `req.cookies` now correctly reads from the `Cookie` request header instead of `Set-Cookie`.
- JSON bodies are now capped at 1MB by default. Pass `bodyLimit` in `bodyParserOptions` to override.
- Empty JSON bodies no longer throw a parse error and instead resolve to `{}`.

## [0.0.4] - 2026-06-28

### Added
- Development warnings for missing HTTP handlers, loaders, and `fragment.html` files.

### Changed
- Unified HTMX response handling across the framework.
- HTMX requests now always receive swappable HTML responses, including validation and error states.
- Automatically add `Vary: HX-Request` and `Cache-Control: no-store` headers to HTMX responses.
- Improved request lifecycle and error handling consistency.
- Optimized route matching and sorting.

### Internal
- Refactored the request pipeline for improved consistency and maintainability.
- Simplified routing and error handling logic.
- General code cleanup.
