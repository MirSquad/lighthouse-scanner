---
title: "Lighthouse Scanner — Session Opener"
doc_type: session-opener
project: lighthouse-scanner
created: 2026-03-28
updated: 2026-04-03
status: active
summary: "Paste at the start of every session on the Lighthouse Scanner plugin. Doc manifest, critical CDN constraint, build steps, and standing update instructions."
tags: [wordpress, plugin, performance, lighthouse, pagespeed, angie, mcp, miriamschwab-site]
blog_candidate: false
---

# Lighthouse Scanner — Session Opener

Paste this at the start of every working session on this project. It is not the handoff doc — it is the doc management layer. It tells you what docs exist and instructs you to produce updated content at session end, automatically.

**To end a session and trigger all doc updates: say "wrap up."**

---

## Project snapshot

Custom WordPress plugin for miriamschwab.me (Elementor Hosting) that runs Google PageSpeed Insights scans from the WordPress admin. Current version: **2.2.0 — stable**. Includes scan history, update regression alerts, REST API, and an Angie MCP server for conversational Lighthouse score queries.

---

## Doc manifest

| Doc | Filename | Update trigger |
|---|---|---|
| Session Opener | `lighthouse-scanner-session-opener.md` | When open items or doc structure change |
| Handoff | `lighthouse-scanner-handoff.md` | Every session — reflects current state |
| Project Context | `lighthouse-scanner-project-context.md` | When architecture or technical details change |
| Changelog | `lighthouse-scanner-changelog.md` | Every session — append a new entry |
| Decisions Log | `lighthouse-scanner-decisions-log.md` | When a significant decision is made |

All files live in: `Claude Work/dev-work/plugins/lighthouse-scanner/`

> **Note:** The doc previously named `lighthouse-scanner-start-here.md` has been renamed to `lighthouse-scanner-handoff.md`. Same content, correct doc_type.

---

## Relevant skills

- `work-docs` — doc management, frontmatter, five-pillar system
- `plugin-builder` — WordPress plugin standards, version bump rules, packaging, CDN patterns, Angie/MCP integration patterns
- `wp-site-builder` — Elementor Hosting-specific patterns; update with any new hosting gotchas discovered this session

---

## Critical context before touching anything

**The admin JS and CSS are inlined via `readfile()`, not enqueued — this is intentional and must not be changed.** Elementor Hosting's Cloudflare CDN caches static plugin assets by file path and ignores `?ver=` cache-busters. Any `wp_enqueue_script()` change to `admin.js` or `admin.css` will silently serve stale files to users.

Before changing any JS, CSS, or enqueue logic:
1. Read the decisions log entry: "Admin JS and CSS inlined via `readfile()`, not enqueued as static assets"
2. The Angie MCP server JS (`angie/dist/mcp-server.js`) is the only exception — it can stay enqueued normally

The things that must never change without understanding this history:
- `wp_enqueue_script()` or `wp_enqueue_style()` for `admin.js` or `admin.css`
- Any refactor that moves the admin page assets back to `/assets/` as static files

---

## Open items

- WordPress core updates do not trigger the regression notice — would need the `_core_updated_successfully` hook (or similar). Not currently implemented; decision needed on whether to add it.

---

## Build steps (Angie MCP server)

Only needed after changes to `angie/src/mcp-server.ts`:

```
cd angie
npm install
npm run build
```

Output: `angie/dist/mcp-server.js` — this is what WordPress loads. Exclude `node_modules` from the plugin zip.

---

## Standing instructions for Claude

When Miriam says "wrap up," produce the following without being asked. Always output complete files — never snippets, partial content, or diff-style changes. Every doc that changed must be output in full so Miriam can do a straight replacement.

**Source docs:** Always base wrap-up output on the files Miriam attached at the start of the session. Do not use project files at `/mnt/project/` as the source — those are read-only copies that may be one or more sessions behind the attached files.

1. **Changelog:** Output the complete updated `lighthouse-scanner-changelog.md` with a new entry appended — date, what changed at the file level (specific, not vague), decisions made, dead ends, what's next.

2. **Handoff doc:** If current state changed (version, status, open items, fragile things), output the complete updated `lighthouse-scanner-handoff.md`.

3. **Decisions log:** If a new architectural decision was made, output the complete updated `lighthouse-scanner-decisions-log.md` with the new entry appended — problem, decision, why, risks, conditions that could change it.

4. **Project context:** If file structure, architecture, dependencies, or any technical detail changed, output the complete updated `lighthouse-scanner-project-context.md`.

5. **plugin-builder skill:** If any plugin-specific insight was discovered (gotcha, pattern, workaround), output the complete updated `plugin-builder-SKILL.md` in full and package it as a `.skill` file for installation. Never output a snippet — always the complete file plus the packaged skill.

6. **wp-site-builder skill:** If any Elementor Hosting-specific insight was discovered, output the complete updated skill SKILL.md in full and package it as a `.skill` file for installation. Never output a snippet — always the complete file plus the packaged skill.

7. **Version bump:** If a new plugin zip was produced this session, confirm the version number was incremented in every required location before packaging. If it was not bumped, flag it and output the corrected version strings.

8. **Open items:** Output an updated version of the open items section above.

9. **Frontmatter:** Output updated frontmatter blocks for every doc that changed, with today's actual date in the `updated` field.

10. **Session opener:** If anything changed, output the complete updated version of this file.
