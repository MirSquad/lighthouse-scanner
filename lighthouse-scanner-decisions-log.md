---
title: "Lighthouse Scanner — Decisions Log"
doc_type: decisions-log
project: lighthouse-scanner
created: 2026-03-24
updated: 2026-03-29
status: active
summary: "Architectural decisions for the Lighthouse Scanner plugin — what was decided, what was rejected, and why. Read before making any structural changes."
tags: [wordpress, plugin, performance, lighthouse, pagespeed, angie, mcp, miriamschwab-site, cdn, rest-api]
blog_candidate: false
---

# Lighthouse Scanner — Decisions Log

Records significant architectural decisions: what was decided, what alternatives were rejected, and why. Read this before making changes to any core architecture. If something looks like it could be simplified, check here first.

---

## Decision: Admin JS and CSS inlined via `readfile()`, not enqueued as static assets

**What was decided:** The plugin's `assets/admin.js` and `assets/admin.css` are output directly into the admin page HTML via PHP `readfile()` inside `add_action('admin_head', ...)` and `add_action('admin_footer', ...)` hooks.

**What was tried:** Standard `wp_enqueue_script()` and `wp_enqueue_style()` with versioned filenames (e.g. `?ver=2.0.5`).

**Why the alternative fails:** Elementor Hosting's Cloudflare CDN caches static plugin assets by file path. The `?ver=` query string that WordPress appends as a cache-buster is ignored — the CDN serves the cached file regardless. Multiple updates to the admin JS were invisible to users for extended periods. This was confirmed by browser inspection showing the old file version being served despite new installs.

**Why inlining works:** Admin pages (`/wp-admin/`) are served dynamically by PHP and are never cached by the CDN. Outputting the JS and CSS inline into the admin page HTML means they always reflect the current file on disk.

**Scope:** This applies only to the main admin page JS/CSS. The Angie MCP server JS (`angie/dist/mcp-server.js`) is enqueued normally via `wp_enqueue_script()` because it changes infrequently and Angie re-fetches it as needed.

**Do not switch back to `wp_enqueue_script()` for admin JS/CSS** without first confirming the CDN caching issue has been resolved at the hosting level.

---

## Decision: Scan history stored in `wp_options`, capped at 20 entries, no time expiry

**What was decided:** Scan history is stored as a JSON array in `wp_options` under the key `lhsc_history`. The array is capped at 20 entries — new entries are prepended, and the array is sliced to 20 after each save. There is no time-based expiry.

**What was considered:** A custom database table, or transients with automatic expiry.

**Why `wp_options`:** Simple, requires no database schema changes, works on any WordPress installation, and is automatically included in WordPress backups. For 20 scan entries, the size is manageable within `wp_options` constraints.

**Why no time expiry:** Lighthouse scores don't become irrelevant after a set period — a score from three months ago is still meaningful context when comparing against today's score. The 20-entry cap provides a practical limit without arbitrary time-based deletion.

**Why 20 entries:** Enough history to show meaningful trends in the sparkline graph and score delta comparisons, while keeping `wp_options` size reasonable. Each entry includes up to 20 audit findings per URL — at typical site sizes, 20 entries fits comfortably within `wp_options` limits.

---

## Decision: "Scan this page" uses a server-side `href` with `?lhsc_scan_url=` parameter, not frontend JS

**What was decided:** The admin bar "Scan this page" link navigates to the plugin admin page with `?lhsc_scan_url={current_url}` and `?lhsc_autorun=1` in the URL. The plugin page detects these parameters on load and triggers the scan automatically.

**What was tried:** A JavaScript-triggered scan initiated from the admin bar overlay while on the front-end page.

**Why JS triggering was abandoned:** The admin bar JS runs in the front-end context (logged-in view of the site). Running a PageSpeed scan from there requires making API calls from the front-end, which raised authentication and CORS complexity. The server-side href approach is simpler: navigate to the admin, then trigger the scan from the admin context where all authentication is already handled.

**Trade-off:** Requires a page navigation (front-end → admin). This is acceptable — scanning is not a zero-friction operation, and the user is already in admin mode (logged in with admin bar visible).

---

## Decision: Update detection notice uses `upgrader_process_complete` hook, 7-day transient

**What was decided:** When any plugin or theme update completes, a transient `lhsc_update_notice` is set for 7 days. An admin notice then appears on all admin pages (for admins only) prompting a scan.

**What was considered:** A shorter transient lifetime, or triggering only on theme updates (not all plugin updates).

**Why 7 days:** Long enough that the notice persists through the natural gap between deploying an update and the next time the admin opens WordPress. Short enough that it doesn't become permanently annoying if the user dismisses it or forgets.

**Why all plugin updates, not just theme:** Any plugin update could theoretically affect front-end performance — a caching plugin change, a JS-heavy plugin update, etc. Erring on the side of broader coverage is safer.

**What it does NOT cover:** WordPress core updates (a different hook would be needed — `_core_updated_successfully`). Manual file uploads via FTP or direct file editing. These are edge cases for this site.

---

## Decision: URL auto-detection excludes Elementor internal CPTs

**What was decided:** The `lhsc_get_site_urls()` function explicitly excludes a hardcoded list of internal post types from URL auto-detection.

**Excluded types include:**
- WordPress core internals: `attachment`, `revision`, `nav_menu_item`, `custom_css`, `wp_block`, `wp_template`, `wp_template_part`, `wp_global_styles`, `wp_navigation`
- Elementor internals: `elementor_library`, `elementor_font`, `elementor_icons`, `elementor_snippet`, `e-floating-buttons`, `elementor_component`
- ACF internals: `acf-field-group`, `acf-field`

**Why:** Without exclusions, the auto-detected URL list fills up with internal Elementor and WordPress types that have no meaningful front-end URLs. Scanning them produces irrelevant results and clutters the UI. The first version without these exclusions showed `Template: Default Kit` and similar internal items in the list.

**If new internal types appear:** Add them to the `$builtin` array in `lhsc_get_site_urls()` in `lighthouse-scanner.php`.

---

## Decision: REST API requires `manage_options` capability, authenticated via Application Passwords

**What was decided:** All five REST API endpoints require WordPress `manage_options` capability. External tools authenticate using WordPress Application Passwords (Dashboard → Users → Edit User → Application Passwords).

**Why `manage_options`:** Scan results include detailed performance audit findings that could reveal implementation details of the site. History deletion is irreversible. Both warrant administrator-only access.

**Why Application Passwords over custom tokens:** Application Passwords are built into WordPress core (since 5.6), don't require custom token management, and are the standard for REST API authentication. No additional plugin or infrastructure needed.

---

## Decision: Angie MCP server uses in-browser JS approach, not Remote MCP Gateway

**What was decided:** The Angie MCP server runs as a JavaScript file enqueued in the WordPress admin page. It registers tools with Angie via `@elementor/angie-sdk`. Authentication is via a WordPress nonce passed through `wp_localize_script`.

**What was considered:** A Remote MCP Gateway — a proper server-side MCP endpoint using SSE or HTTP Streamable transport.

**Why in-browser approach was chosen:** The Remote MCP Gateway would require a standalone server process, domain/SSL configuration, and ongoing server maintenance. The in-browser approach runs entirely within the existing WordPress admin environment — no additional infrastructure. Angie auto-discovers tools registered in the admin page context, so no gateway configuration is needed.

**Limitation:** The MCP tools are only available when the user is on a WordPress admin page with Elementor active. They are not available to external tools or scripts — for those, the REST API is the correct approach.

---

## Decision: Angie MCP server compiled to IIFE bundle via Vite

**What was decided:** TypeScript source in `angie/src/mcp-server.ts` is compiled to a single IIFE bundle at `angie/dist/mcp-server.js` using Vite.

**Why IIFE:** WordPress loads scripts in a browser environment. An IIFE (Immediately Invoked Function Expression) bundle is self-contained and doesn't require ES module support or import maps. It works reliably across all browsers and WordPress admin environments.

**Why TypeScript:** `@elementor/angie-sdk` and the MCP SDK (`@modelcontextprotocol/sdk`) are TypeScript packages. Using TypeScript for the MCP server gives type safety and proper SDK integration.

**Build process:** `cd angie && npm install && npm run build`. `node_modules` must be excluded from the plugin zip — only `angie/dist/mcp-server.js` needs to ship. This is a one-time build on a local machine; Node.js is not needed on the WordPress server.

---

## Decision: `manage_options` capability check for admin bar menu

**What was decided:** The admin bar scan menu (⚡ Scan) is only shown to users with `manage_options` capability.

**Why:** The admin bar is visible to any logged-in user with admin bar access, which includes editors and authors. Showing scan links to non-administrators would be confusing (they can't access the plugin page) and could expose performance audit findings to users who shouldn't see them.

---

## Decision: History stored per-site, not per-user

**What was decided:** `lhsc_history` in `wp_options` is a single site-wide history, not scoped to individual users.

**Why:** PageSpeed scores are properties of the site, not of individual users. Multiple administrators sharing a site benefit from seeing the same history. Per-user history would fragment the trend data and make the sparkline graph less meaningful.

**Trade-off:** If multiple admins run scans simultaneously, entries may interleave in history. This is an acceptable edge case for a single-site personal site.
