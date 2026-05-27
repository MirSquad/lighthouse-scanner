=== Lighthouse Scanner ===
Contributors: miriamschwab
Tags: lighthouse, pagespeed, performance, accessibility, seo
Requires at least: 5.9
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 2.2.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Run Google PageSpeed Insights scans across your site. Tracks history, alerts on regressions, and copies reports for AI-assisted fixes.

== Description ==

Lighthouse Scanner lets you run Google PageSpeed Insights scans on any page of your site directly from the WordPress admin. It tracks score history, shows you regressions after plugin or theme updates, and produces a copy-ready report you can paste into Claude or another AI assistant for targeted fix suggestions.

**Features**

* Scan any URL on your site — homepage, pages, posts, or any custom post type
* Auto-populates a URL list from your site's top-level pages and public content types
* Strategy selector — Mobile and Desktop scanning
* Score history with up to 20 saved scans — compare trends over time
* Regression alert — an admin notice fires automatically when a plugin or theme is updated
* Admin-bar "Scan this page" shortcut — scan the page you're currently viewing in one click
* Copy report for Claude — exports a formatted, AI-ready summary of scores and issues
* Export CSV — download scan results for offline analysis
* REST API (`lighthouse-scanner/v1`) — expose scan data and trigger scans from external tools or AI agents
* Google API key support — without a key, scans are rate-limited to ~1/minute; with a key, 25,000/day

**Third-party service**

This plugin sends page URLs to the Google PageSpeed Insights API to perform scans. No login data or private content is sent. Please review [Google's Privacy Policy](https://policies.google.com/privacy) before use.

== Installation ==

1. Upload the `lighthouse-scanner` folder to `/wp-content/plugins/`.
2. Activate from **Plugins > Installed Plugins**.
3. Go to **Tools > Lighthouse Scanner**.
4. Choose how to populate your URL list (auto or manual) and optionally add a Google API key.

== Frequently Asked Questions ==

= Do I need a Google API key? =

No, but it helps. Without a key, the PageSpeed Insights API limits you to approximately 1 scan per minute. With a free API key from [Google Cloud Console](https://console.cloud.google.com/), you get 25,000 scans per day.

= How do I get a Google API key? =

1. Go to [console.cloud.google.com](https://console.cloud.google.com/).
2. Create a project and enable the **PageSpeed Insights API**.
3. Create an API key and paste it into the Google API Key field in the plugin settings.

= What does the plugin store? =

Scan history (up to 20 entries) is stored in a WordPress option (`lhsc_history`). Each entry includes URLs, scores, and issue titles — no page content. The Google API key is stored in a separate WordPress option (`lhsc_api_key`). Both are deleted when the plugin is uninstalled.

= Can I integrate this with an AI agent? =

Yes. The plugin exposes a REST API at `lighthouse-scanner/v1` that requires the `manage_options` capability. Endpoints: `GET /urls`, `GET /history`, `GET /history/{id}`, `POST /scan`, `DELETE /history`. Authentication uses WordPress application passwords.

= What is the "Alert below" threshold? =

Scores at or below the threshold value are highlighted red. The default is 85. Set it to 0 to disable alerts, or 100 to flag everything below perfect.

== Changelog ==

= 2.2.0 =
* Added: REST API (`lighthouse-scanner/v1`) for AI agent and external tool integration.
* Added: `GET /urls`, `GET /history`, `GET /history/{id}`, `POST /scan`, `DELETE /history` endpoints.

= 2.1.0 =
* Added: Admin-bar "Scan this page" shortcut — scans the current frontend page with one click.
* Added: Autocomplete post/page search to add URLs to the scan list.

= 2.0.0 =
* Added: Scan history with up to 20 saved entries and score trend graph.
* Added: Regression alert admin notice fires automatically after plugin or theme updates.
* Added: Copy report for Claude — formatted, AI-ready export of scan results.
* Added: CSV export.
* Added: Setup wizard on first activation (auto-populate vs manual URL list).
* Added: Strategy selector (Mobile / Desktop).

= 1.0.0 =
* Initial release.

== Upgrade Notice ==

= 2.2.0 =
Adds a REST API for AI agent integration. No breaking changes.

= 2.0.0 =
Major release — adds scan history, regression alerts, and the copy-for-Claude export. No breaking changes.
