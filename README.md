# Lighthouse Scanner WordPress Plugin

A WordPress plugin that runs Google PageSpeed Insights scans on your site's pages directly from the WordPress admin. Track performance scores over time, get alerted after plugin or theme updates, and copy results formatted for AI-assisted debugging.

## Why

Performance monitoring shouldn't require leaving WordPress. This plugin brings PageSpeed Insights into your admin dashboard — scan pages, compare scores against previous runs, and get notified when a theme or plugin update might have caused a regression. The "Copy report for Claude" feature formats scan results for pasting directly into a conversation with an AI assistant to diagnose and fix issues.

## Features

- **Batch scanning** — scan multiple pages at once with a progress indicator
- **Score tracking** — Performance, Accessibility, Best Practices, and SEO scores with color-coded badges (green/orange/red)
- **Score deltas** — see how each page changed compared to the previous scan
- **Scan history** — stores the last 20 scans with sparkline graphs showing score trends
- **Threshold alerts** — highlight pages that fall below a configurable Performance score threshold
- **Update detection** — automatic admin notice after any theme or plugin update, prompting you to re-scan
- **Admin bar scanning** — scan the page you're viewing from the front-end admin bar
- **Setup wizard** — auto-populates your URL list from the WordPress database on first run
- **URL search** — find and add any post, page, or custom post type via live search
- **Copy report for Claude** — one-click clipboard copy of scan results formatted for AI analysis
- **Export CSV** — download scan results as a spreadsheet
- **REST API** — five endpoints under `lighthouse-scanner/v1` for external tool access
- **Angie MCP integration** — Elementor's Angie AI assistant can query scores and trigger scans conversationally

## How it works

The plugin calls the [Google PageSpeed Insights API](https://developers.google.com/speed/docs/insights/v5/get-started) for each tracked URL. An API key is optional but recommended — without one, you're limited to roughly 1 request per minute; with a key, 25,000 requests per day.

Scan results are stored in `wp_options` and displayed with score badges, delta indicators, and expandable audit findings showing exactly what Lighthouse flagged.

## Installation

1. Download or clone this repository
2. Copy the `lighthouse-scanner` folder into `wp-content/plugins/`
3. Activate the plugin in WordPress
4. Go to **Tools > Lighthouse Scanner** — the setup wizard will guide you through URL selection and optional API key entry

To get a free Google PageSpeed API key, visit the [Google Cloud Console](https://console.cloud.google.com/apis/credentials) and enable the PageSpeed Insights API.

## REST API

All endpoints require WordPress admin authentication (Application Passwords).

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/wp-json/lighthouse-scanner/v1/urls` | List tracked URLs |
| GET | `/wp-json/lighthouse-scanner/v1/history` | Scan history (supports `?limit`, `?strategy`, `?url` filters) |
| GET | `/wp-json/lighthouse-scanner/v1/history/{id}` | Single scan by ID |
| POST | `/wp-json/lighthouse-scanner/v1/scan` | Trigger or save a scan |
| DELETE | `/wp-json/lighthouse-scanner/v1/history` | Clear all history |

## Angie MCP Server

The plugin includes an MCP server for Elementor's Angie AI assistant. When Elementor is active, Angie can answer questions like "What are my Lighthouse scores?" or "Run a scan and tell me if anything changed." The MCP server registers three tools (`get-lighthouse-urls`, `get-lighthouse-history`, `run-lighthouse-scan`) that Angie discovers automatically.

Build the MCP server (one-time): `cd angie && npm install && npm run build`

## Requirements

- WordPress 5.0+
- PHP 7.4+
- A Google PageSpeed Insights API key (optional but recommended)
- Elementor + Angie (optional, for MCP integration)

## License

GPL-2.0-or-later

## WordPress Abilities API

This plugin exposes abilities for the [WordPress Abilities API](https://developer.wordpress.org/apis/abilities-api/) (WordPress 6.9+), making it controllable by AI agents via the [MCP Adapter](https://github.com/WordPress/mcp-adapter) plugin.

### Requirements

- WordPress 6.9+
- [MCP Adapter plugin](https://github.com/WordPress/mcp-adapter)

### Available abilities

| Ability | Access | Description |
|---|---|---|
| `lighthouse-scanner/get-settings` | Always on | Returns the score threshold, setup status, and whether a Google API key is saved |
| `lighthouse-scanner/get-urls` | Always on | Returns the configured scan URL list with display labels |
| `lighthouse-scanner/get-history` | Always on | Returns up to 20 scan entries, newest first, including scores and failing audits with resource-level details |
| `lighthouse-scanner/run-scan` | Write (opt-in) | Kicks off a full PageSpeed Insights scan of all configured URLs in the background. Returns immediately — call `get-history` ~60 seconds later to retrieve results |

### How `run-scan` works

`run-scan` schedules the scan as a background job using WordPress's cron system and returns immediately without waiting. The plugin calls the Google PageSpeed Insights API server-side for each configured URL, parses scores and failing audits (including which specific resources are flagged), and saves the result to history in the same format as browser-triggered scans.

Uses the stored Google API key if one is configured; falls back to unauthenticated requests otherwise.

### Enabling write abilities

Write abilities are disabled by default. To enable them, go to **Tools > Lighthouse Scanner**, check **Enable write abilities** in the Settings section, and save.
