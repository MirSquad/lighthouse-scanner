---
title: "Lighthouse Scanner — Project Context"
doc_type: project-context
project: lighthouse-scanner
created: 2026-03-24
updated: 2026-03-29
status: active
summary: "Full technical reference for the Lighthouse Scanner plugin — how PageSpeed Insights works, every feature, the REST API, and the Angie MCP server architecture."
tags: [wordpress, plugin, performance, lighthouse, pagespeed, angie, mcp, miriamschwab-site, rest-api]
blog_candidate: false
---

# Lighthouse Scanner Plugin — Project Context

**Plugin slug:** `lighthouse-scanner`
**Current version:** 2.2.0
**Location in WordPress:** Tools → Lighthouse Scanner
**Author:** Miriam Schwab
**Site:** miriamschwab.me (Elementor Hosting)

---

## What It Does

Lighthouse Scanner is a custom WordPress plugin that runs Google PageSpeed Insights scans on pages of the site directly from the WordPress admin. It provides a complete performance monitoring workflow: scan multiple pages at once, track scores over time, compare against previous scans, get alerted when a theme or plugin update may have caused a regression, and copy results in a format optimised for sharing with an AI assistant for analysis and fixes.

The plugin also exposes a REST API for external tool access, and includes an Angie MCP server so Elementor's Angie AI assistant can answer questions about Lighthouse scores conversationally.

---

## Why It Was Built

The site runs on Elementor Hosting, which has a significant infrastructure constraint: the Cloudflare CDN caches all static plugin and theme assets by file path, ignoring WordPress's standard `?ver=` cache-busting query string. This means standard PageSpeed workflow tools that ship with managed hosting either don't work correctly or require workarounds. The plugin was built to give precise control over scanning and to integrate tightly with the Claude-based development workflow used to build and maintain the site.

---

## How PageSpeed Insights Works

PageSpeed Insights is a free Google API that runs Google's Lighthouse tool against any public URL and returns a JSON report. Lighthouse is the same engine that powers Chrome DevTools performance audits — PageSpeed Insights runs it from Google's servers on a simulated mobile or desktop device.

**The API endpoint:**
```
https://www.googleapis.com/pagespeedonline/v5/runPagespeed
  ?url={encoded_url}
  &strategy={mobile|desktop}
  &key={optional_api_key}
```

**What it returns:**
- Four scores (0-100): Performance, Accessibility, Best Practices, SEO
- Core Web Vitals: LCP (Largest Contentful Paint), FCP (First Contentful Paint), CLS (Cumulative Layout Shift), TBT (Total Blocking Time), Speed Index
- A list of audit findings — each finding has a category, title, description, and display value (e.g. "Reduce unused JavaScript (Est savings of 61 KiB)")

**Rate limits:**
- Without an API key: approximately 1 request per minute, shared across all users of the unauthenticated quota
- With a Google API key: 25,000 requests per day (more than enough for any personal site)
- The plugin prominently encourages API key setup during its wizard for this reason

**Important behaviour to understand:**
PageSpeed Insights is Lighthouse running from Google's servers, not from the local machine. Scores can vary by 5-10 points between runs due to network conditions, CDN cache state, and server load at the moment of the scan. A page cache needs to be warm before scanning for accurate results — the first scan after a cache clear will be slower than subsequent ones.

---

## Setup Wizard

On first activation, the plugin shows a two-step setup wizard:

**Step 1 — URL population:**
The user chooses between:
- **Auto-populate from site** — the plugin queries the WordPress database and builds a URL list automatically (see URL Auto-Detection below)
- **Add URLs manually** — starts with an empty list

**Step 2 — API key:**
The user optionally pastes a Google API key. This is stored encrypted in `wp_options` under `lhsc_api_key`. The wizard explains the rate limit difference (1/min vs 25,000/day). The key can be skipped and added later via the settings row on the main page.

Setup state is stored in `wp_options` as `lhsc_setup_done`. Once setup is complete, the wizard is hidden and the main scanner UI appears.

---

## URL Auto-Detection

The plugin automatically populates a URL list from the WordPress database by querying:

1. **Homepage** — `home_url('/')`
2. **Top-level pages** — all published pages with no parent, excluding the static front page and the posts page
3. **Posts/writing page** — if a static posts page is set in Settings → Reading
4. **Latest blog post** — the most recent published post
5. **Latest from each public CPT** — for every publicly viewable custom post type, the most recent published item. Excludes a long list of internal CPTs: WordPress core types (`attachment`, `revision`, `nav_menu_item`, `wp_block`, `wp_template`, etc.), Elementor internal types (`elementor_library`, `elementor_font`, `e-floating-buttons`, etc.), and ACF field groups.

This means the URL list self-populates sensibly for almost any WordPress site without configuration.

---

## Adding URLs via Search

Below the URL list is a live search field. As the user types (minimum 2 characters), the plugin queries the WordPress database via AJAX (`lhsc_search_posts`) and returns up to 8 matching posts/pages/CPT items. The results show the post title, URL, and post type label. Clicking a result adds it to the tracked URL list.

The search uses `WP_Query` with `'s' => $term` across all publicly viewable post types with `post_status = 'publish'`.

---

## Scanning

**From the main page:**
The user selects a device strategy (Mobile or Desktop) from a dropdown, then clicks "Run scans". The JavaScript iterates through all checked URLs in the list, calling the PageSpeed API for each one sequentially (not in parallel — to avoid rate limit issues). A progress indicator shows which URL is currently being scanned.

Each scan result shows:
- Four circular score badges (Performance, Accessibility, Best Practices, SEO) colour-coded green (90+), orange (50-89), red (0-49)
- Score delta vs the previous scan for the same URL (e.g. "+3" or "-5") shown as a coloured badge
- A collapsible list of Lighthouse audit findings — the specific issues flagged by the scan (e.g. "Render blocking requests", "Improve image delivery", "Reduce unused JavaScript")
- Scores below the configured threshold are highlighted

**From a single page ("Scan this page"):**
When the admin bar is visible on the front end (i.e., while browsing the site logged in as an admin), the admin bar shows a "⚡ Scan" menu. Hovering it reveals a "Scan this page" submenu item. Clicking this navigates to the plugin admin page with `?lhsc_scan_url=` set to the current page URL and `?lhsc_autorun=1`. The plugin detects these parameters and automatically runs a scan for that URL on page load.

---

## Score Threshold Alerts

The plugin stores a configurable threshold score (default: 85) in `wp_options` as `lhsc_threshold`. Any page whose Performance score falls below this threshold is highlighted in red in the results. The threshold can be changed in the settings row at the top of the plugin page.

---

## Copy Report for Claude

After a scan completes, a "Copy report for Claude" button appears. This generates a formatted plain-text report of all scan results — scores for each URL, the full list of audit findings for each — and copies it to the clipboard. The format is optimised for pasting directly into a conversation with Claude or another AI assistant to get help diagnosing and fixing the issues.

The report format shows each URL as a header, then scores, then the list of findings with descriptions and estimated savings values.

---

## Export CSV

A "Export CSV" button appears alongside the Claude button after a scan. This downloads a CSV file with one row per URL, containing the URL, label, all four scores, and strategy.

---

## Scan History

After each scan completes, the JavaScript automatically saves the results to WordPress via an AJAX call (`lhsc_save_history`). The history is stored in `wp_options` as `lhsc_history` — a JSON array of scan entries.

**What each history entry contains:**
- `id` — unique identifier (uniqid)
- `date` — human-readable date string ("Mar 23, 2026")
- `timestamp` — Unix timestamp
- `strategy` — "mobile" or "desktop"
- `results` — array of per-URL results, each containing:
  - `url` — the scanned URL
  - `label` — the human-readable page name
  - `scores` — object with Performance, Accessibility, Best Practices, SEO values
  - `issues` — up to 20 audit findings, each with category, title, description, displayValue

**How long history is kept:**
The plugin retains the last 20 scan entries. When a new scan is saved, it is prepended to the array and the array is sliced to 20 entries. There is no automatic time-based expiry — the 21st oldest entry is simply dropped when a new one comes in.

**History display:**
The history section appears below the scanner when history exists. It shows:
- A sparkline graph visualising the Performance score trend over time for each tracked URL
- A list of all past scans, expandable to see per-URL results

**Clearing history:**
A "Clear history" button in the history section deletes the entire `lhsc_history` option from `wp_options`. This is immediate and irreversible.

---

## Update Detection and Regression Alerts

The plugin hooks into `upgrader_process_complete` — a WordPress action that fires whenever a theme or plugin update completes. When this fires, it stores a transient (`lhsc_update_notice`) for 7 days recording whether a theme or plugin was updated.

On every subsequent WordPress admin page load, if this transient exists, a notice banner appears at the top of the admin:

> ⚡ Lighthouse Scanner: A theme was just updated. Run a scan to check for regressions.

The notice includes a "Run scan now" button that links directly to the scanner page with `?lhsc_autorun=1`, which triggers an automatic scan on page load. The notice also has a dismiss button (×) that fires an AJAX call to delete the transient immediately.

This means the site owner gets a proactive reminder to check performance after every deployment, without having to remember to do it manually.

**Changes that trigger the notice:**
- Any WordPress plugin update (single plugin or bulk update)
- Any WordPress theme update

**Changes that do NOT trigger the notice** (because they don't go through `upgrader_process_complete`):
- Manually uploading a plugin/theme zip via the WordPress uploader (this does trigger it)
- WordPress core updates (would need a separate hook — not currently implemented)
- Content changes (posts, pages, ACF fields)
- WordPress settings changes
- Customizer changes

---

## REST API

From v2.1.0+, the plugin exposes a REST API under the namespace `lighthouse-scanner/v1`. All endpoints require WordPress administrator authentication (`manage_options` capability). External tools (Postman, Claude Desktop, scripts) authenticate using WordPress Application Passwords, generated at Dashboard → Users → Edit User → Application Passwords.

**Endpoints:**

`GET /wp-json/lighthouse-scanner/v1/urls`
Returns the list of tracked URLs with their labels.
```json
[
  { "url": "https://example.com/", "label": "Home" },
  { "url": "https://example.com/about/", "label": "About" }
]
```

`GET /wp-json/lighthouse-scanner/v1/history`
Returns scan history. Optional query parameters:
- `?limit=5` — number of most recent scans to return (default: all)
- `?strategy=mobile` — filter by strategy
- `?url=https://example.com/about/` — filter to scans that included this URL

`GET /wp-json/lighthouse-scanner/v1/history/{id}`
Returns a single scan entry by its ID string.

`POST /wp-json/lighthouse-scanner/v1/scan`
Two modes:
- Trigger mode: `{ "trigger": true }` — marks that a scan should be run (doesn't call PageSpeed API directly)
- Save mode: `{ scan object }` — saves a completed scan result to history (same format as the AJAX save)

`DELETE /wp-json/lighthouse-scanner/v1/history`
Clears all history. Requires admin auth.

---

## Angie MCP Server

From v2.2.0+, the plugin includes an Angie MCP server. This allows Elementor's Angie AI assistant to answer questions about Lighthouse scores conversationally, directly within the WordPress admin.

**How it works:**
1. When the admin page loads and both Elementor/Angie and the compiled JS file exist, WordPress enqueues `angie/dist/mcp-server.js`
2. The JS file registers an MCP server with Angie via `@elementor/angie-sdk`
3. Angie discovers the tools automatically — no configuration needed

**The three tools:**
- `get-lighthouse-urls` — calls `GET /urls`, returns the tracked page list
- `get-lighthouse-history` — calls `GET /history` with optional filters, returns stored scan results formatted for readability
- `run-lighthouse-scan` — fetches the URL list, calls the PageSpeed API for each URL, POSTs results back via `POST /scan`

**Authentication:**
The MCP server uses a WordPress nonce passed via `wp_localize_script` at page load (`lhscAngie.nonce`). This ties the Angie connection to the current admin session — no separate credentials needed.

**Build process:**
The MCP server is written in TypeScript (`angie/src/mcp-server.ts`) and compiled to a single IIFE bundle (`angie/dist/mcp-server.js`) using Vite. Node.js is only needed once to run the build — it is not needed on the WordPress server. The compiled file is what ships in the plugin zip. `node_modules` must be excluded when packaging.

Build command: `cd angie && npm install && npm run build`

---

## Technical Architecture

**Single-file plugin** — all PHP logic lives in `lighthouse-scanner.php`. Admin JS and CSS are in `assets/admin.js` and `assets/admin.css`.

**CDN bypass** — Elementor Hosting's Cloudflare CDN caches static plugin assets by path, ignoring WordPress's `?ver=` cache-buster. To work around this, the plugin's JS and CSS are **inlined directly into the admin page HTML** via PHP `readfile()` rather than being enqueued as static assets. Admin pages are served dynamically and are never CDN-cached. The Angie MCP server JS (`angie/dist/mcp-server.js`) is loaded normally via `wp_enqueue_script` — it doesn't need the same workaround because it changes infrequently.

**Storage:**
- `lhsc_api_key` (wp_options) — PageSpeed API key
- `lhsc_threshold` (wp_options) — alert threshold (default 85)
- `lhsc_setup_done` (wp_options) — setup completion flag
- `lhsc_history` (wp_options) — array of up to 20 scan entries
- `lhsc_update_notice` (transient, 7 days) — pending regression alert

**Security:**
- All admin actions require `manage_options` capability
- All AJAX calls verify a nonce (`lhsc_nonce`)
- All REST API endpoints require admin auth via `permission_callback`
- All user input is sanitised before storage

---

## Example Prompts for Angie

Once the MCP server is active, users can ask Angie things like:

- "What are my current Lighthouse scores?"
- "Which pages have the lowest performance scores?"
- "Run a new Lighthouse scan and tell me if anything changed"
- "What issues are flagged on my homepage?"
- "Have my scores improved since last week?"
