---
title: "Lighthouse Scanner — Changelog"
doc_type: changelog
project: lighthouse-scanner
created: 2026-03-24
updated: 2026-03-29
status: active
summary: "Full version history for the Lighthouse Scanner plugin, from v1.0.0 through v2.2.0."
tags: [wordpress, plugin, performance, lighthouse, pagespeed, angie, mcp, miriamschwab-site]
blog_candidate: false
---

# Lighthouse Scanner Plugin — Changelog

Custom plugin for miriamschwab.me. Located at Tools → Lighthouse Scanner in WordPress admin.

---

## v2.2.0
**Angie MCP server integration**
- Added `angie/` folder containing a TypeScript MCP server built with `@elementor/angie-sdk` + Vite
- `angie/src/mcp-server.ts` — registers three tools with Angie: `get-lighthouse-urls`, `get-lighthouse-history`, `run-lighthouse-scan`
- `lighthouse-scanner.php` — new `admin_enqueue_scripts` hook enqueues compiled `angie/dist/mcp-server.js` when Elementor is active; passes `lhscAngie` object (restUrl, nonce, apiKey, version) via `wp_localize_script`
- Angie auto-discovers tools on admin pages — no gateway configuration needed
- Build process: `cd angie && npm install && npm run build` → produces `angie/dist/mcp-server.js`. One-time setup; node_modules excluded from zip.
- **Confirmed working** — Angie successfully answers "What are my Lighthouse scores?" from stored history

## v2.1.0
**REST API layer**
- Five endpoints registered under `lighthouse-scanner/v1`:
  - `GET /urls` — list all tracked pages
  - `GET /history` — scan history with optional `?limit`, `?strategy`, `?url` filters
  - `GET /history/{id}` — single scan result by ID
  - `POST /scan` — trigger mode (`{trigger:true}`) or save completed results
  - `DELETE /history` — clear all history
- All endpoints require `manage_options` capability
- Authentication: WordPress Application Passwords (Dashboard → Users → Edit → Application Passwords)
- Foundation for Angie MCP integration and external tool access

## v2.0.5
**CDN cache bypass — permanent fix**
- JS and CSS inlined into admin page HTML via PHP `readfile()` instead of standard `wp_enqueue_script/style`
- Root cause: Elementor Hosting's Cloudflare CDN caches static plugin assets by file path only, ignoring WordPress's `?ver=` cache-buster query string. Updates to JS/CSS were invisible until CDN cache expired.
- Admin pages are served dynamically (never CDN-cached), so inlining assets into admin page HTML is CDN-safe
- See `elementor-hosting-cdn-cache-bug-report.md` for full bug report

## v2.0.4
- Controls layout moved to inline styles — WordPress admin CSS was overriding `flex` layout rules
- `scanThisUrl` notice added to admin bar scan flow

## v2.0.3
- "Scan this page" admin bar link rewired as server-side `href` with `?lhsc_scan_url=` parameter instead of JS-triggered scan

## v2.0.2
- Layout fix for select element width (`!important` required against admin CSS)
- Admin bar overlay rewritten in JS

## v2.0.1
- Fixed Elementor internal CPTs (`Template:Default Kit` etc.) appearing in tracked URL list — excluded via post type check
- Setup wizard step 2 now adds PageSpeed API key
- Admin bar link refactored to plain `href`

## v2.0.0
**Full rebuild**
- Setup wizard for initial configuration
- Autocomplete URL search
- Admin bar "Scan this page" link
- Update detection notice (fires after theme/plugin updates — not content changes)
- Scan history with sparkline graph
- Score delta vs previous scan
- Export CSV
- Score threshold alerts
- CPT auto-detection (tracks all public custom post types)
- "Copy report for Claude" button

## v1.2.1
- Fixed `&amp;` double-encoding in JS labels

## v1.2.0
- Added checkboxes for selective page scanning
- Select all toggle

## v1.1.0
- Fatal error fix on activation (duplicate `define()` constants)

## v1.0.0
- Initial release
