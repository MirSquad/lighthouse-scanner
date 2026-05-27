---
title: "Lighthouse Scanner — Handoff Doc"
doc_type: handoff
project: lighthouse-scanner
created: 2026-03-24
updated: 2026-05-25
status: active
summary: "Current state snapshot for the Lighthouse Scanner plugin. Read this before any session — covers version, what's working, what's fragile, and what's been ruled out."
tags: [wordpress, plugin, performance, lighthouse, pagespeed, angie, mcp, miriamschwab-site]
blog_candidate: false
---

# Lighthouse Scanner — Handoff Doc

Read this before touching anything. It tells you the current state, what's fragile, and what to watch out for. Then read the project context doc for full technical detail.

---

## What This Is

A custom WordPress plugin for miriamschwab.me that runs Google PageSpeed Insights scans on pages of the site directly from the WordPress admin. Built across multiple sessions as part of the broader site build project.

**Plugin slug:** `lighthouse-scanner`
**Location in WordPress:** Tools → Lighthouse Scanner
**Author:** Miriam Schwab

---

## Current State (as of 2026-05-25)

**Version:** 2.2.0 — stable

**WP.org readiness (Session 10 — 2026-05-25):** Plugin header, i18n, and readme are now WP.org-ready. New files: `readme.txt`, `uninstall.php`, `languages/`. Bug fixed: `$scan_url` undefined in `lhsc_render_page()` — "Scanning…" notice now actually shows when arriving from the admin-bar shortcut.

**What's working:**
- Full scanning UI with device strategy (mobile/desktop)
- URL auto-detection from WP database
- Autocomplete search to add any post/page
- Admin bar "Scan this page" link
- Score threshold alerts (default 85)
- Scan history — 20 entries, no time expiry
- Update detection notice (fires after theme/plugin updates)
- Copy report for Claude button
- CSV export
- REST API (5 endpoints, auth via Application Passwords)
- Angie MCP server — confirmed working, Angie can answer "What are my Lighthouse scores?"

---

## The Single Most Important Thing to Know

**The plugin's JS and CSS are inlined into the admin page HTML via PHP `readfile()`, not enqueued as static assets.** This is the permanent fix for Elementor Hosting's CDN caching problem.

Elementor Hosting's Cloudflare CDN caches static plugin assets by file path, ignoring `?ver=` cache-busters. Any change to `assets/admin.js` or `assets/admin.css` delivered via normal `wp_enqueue_script()` would be invisible to users until the CDN cache expired.

**The fix:** The admin page PHP function reads both files at render time and outputs them inline inside `<style>` and `<script>` tags. Admin pages are served dynamically and are never CDN-cached.

**Do not switch back to `wp_enqueue_script()` for the admin JS/CSS.** See the decisions log for full detail.

---

## What's Fragile

**The Angie MCP server requires a build step.** The TypeScript source is in `angie/src/mcp-server.ts`. The compiled output `angie/dist/mcp-server.js` is what WordPress loads. If you modify the TypeScript, you must rebuild: `cd angie && npm install && npm run build`. The compiled file must exist before installing the plugin. Exclude `node_modules` from the zip.

**The update detection notice uses a transient.** `lhsc_update_notice` is stored as a 7-day transient. It fires when `upgrader_process_complete` runs — which means theme and plugin updates, but NOT WordPress core updates or manual file uploads via FTP. If the notice isn't appearing after an update, check whether the update went through the WordPress upgrader.

**History is capped at 20 entries.** This is by design — stored in `wp_options` as `lhsc_history`. The 21st entry drops the oldest. There is no time-based expiry. If you see unexpected history loss, check whether something is clearing `wp_options`.

**The Angie MCP server is only enqueued when Elementor is active.** If Elementor is deactivated, the MCP tools disappear from Angie. This is intentional — the server uses `wp_localize_script` to pass authentication data, which requires the Elementor admin environment.

---

## What's Been Tried and Ruled Out

- **Standard `wp_enqueue_script()` for admin JS/CSS** — does not work on this host. CDN caches by path, ignores `?ver=`. Tried multiple times across sessions. Inlining via `readfile()` is the only reliable approach.
- **Remote MCP Gateway for Angie** — would require a proper MCP SSE/HTTP Streamable server. The current in-browser JS approach (tools registered in the admin page context) is simpler and works without server infrastructure.
- **More than 20 history entries** — was considered but `wp_options` has a size limit. 20 entries is the safe cap.

---

## Open Items

- WordPress core updates do not trigger the regression notice — would need a separate hook (`_core_updated_successfully` or similar). Not currently implemented.

---

## Where the Files Are

**Plugin:** `lighthouse-scanner.zip` — upload via Plugins → Add New → Upload

**After any TypeScript changes:** `cd angie && npm install && npm run build`, then repackage without `node_modules`

**Docs to bring to every session:**
1. `lighthouse-scanner-session-opener.md` — start here
2. This file (`lighthouse-scanner-handoff.md`)
3. `lighthouse-scanner-project-context.md` — full technical reference
4. `lighthouse-scanner-changelog.md` — version history
5. `lighthouse-scanner-decisions-log.md` — why things are built the way they are
6. The current plugin zip

---

## Document Index

| Document | Purpose |
|---|---|
| `lighthouse-scanner-session-opener.md` | Doc manifest and standing update instructions. Paste at session start. |
| `lighthouse-scanner-handoff.md` | This file. Current state, fragile things, ruled-out approaches. |
| `lighthouse-scanner-project-context.md` | Full technical reference — PageSpeed API, UI, history, REST API, Angie MCP |
| `lighthouse-scanner-changelog.md` | Version history from v1.0.0 through v2.2.0 |
| `lighthouse-scanner-decisions-log.md` | Why key architectural decisions were made |
