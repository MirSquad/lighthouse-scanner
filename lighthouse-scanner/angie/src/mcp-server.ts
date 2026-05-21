/**
 * Lighthouse Scanner — Angie MCP Server
 *
 * Registers Lighthouse Scanner tools with Angie so users can ask things like:
 *   "What are my Lighthouse scores?"
 *   "Which pages have performance issues?"
 *   "Run a Lighthouse scan on my site"
 *
 * Tools:
 *   get-lighthouse-urls     — list all tracked pages
 *   get-lighthouse-history  — retrieve scan history with scores and issues
 *   run-lighthouse-scan     — trigger a full PageSpeed scan and save results
 */

import { AngieMcpSdk } from '@elementor/angie-sdk';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/* --------------------------------------------------
   WordPress globals injected by wp_localize_script
   in lighthouse-scanner.php
   -------------------------------------------------- */
interface LhscAngie {
	restUrl: string;   // e.g. https://example.com/wp-json/
	nonce:   string;   // WP REST nonce
	apiKey:  string;   // PageSpeed Insights API key (may be empty)
	version: string;   // Plugin version
}

declare global {
	interface Window {
		lhscAngie: LhscAngie;
		wpApiSettings?: { root: string; nonce?: string };
	}
}

/* --------------------------------------------------
   REST API helpers
   -------------------------------------------------- */
function restUrl( path: string ): string {
	const base = window.lhscAngie?.restUrl
		|| window.wpApiSettings?.root
		|| '/wp-json/';
	return base.replace( /\/$/, '' ) + '/lighthouse-scanner/v1' + path;
}

function nonce(): string {
	return window.lhscAngie?.nonce
		|| window.wpApiSettings?.nonce
		|| '';
}

async function restGet( path: string ): Promise<unknown> {
	const res = await fetch( restUrl( path ), {
		headers: { 'X-WP-Nonce': nonce() },
		credentials: 'same-origin',
	} );
	if ( ! res.ok ) throw new Error( `REST error ${ res.status }: ${ res.statusText }` );
	return res.json();
}

async function restPost( path: string, body: unknown ): Promise<unknown> {
	const res = await fetch( restUrl( path ), {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-WP-Nonce': nonce(),
		},
		credentials: 'same-origin',
		body: JSON.stringify( body ),
	} );
	if ( ! res.ok ) throw new Error( `REST error ${ res.status }: ${ res.statusText }` );
	return res.json();
}

/* --------------------------------------------------
   PageSpeed Insights helpers
   -------------------------------------------------- */
interface PageSpeedResult {
	url:    string;
	label:  string;
	scores: Record<string, number>;
	issues: Array<{
		category:     string;
		title:        string;
		description:  string;
		displayValue: string;
	}>;
}

async function runPageSpeedScan(
	urls: Array<{ url: string; label: string }>,
	strategy: 'mobile' | 'desktop' = 'mobile',
	apiKey: string
): Promise<PageSpeedResult[]> {
	const results: PageSpeedResult[] = [];

	for ( const { url, label } of urls ) {
		try {
			const params = new URLSearchParams( {
				url,
				strategy,
				category: 'performance',
			} );
			// Add multiple categories
			[ 'accessibility', 'best-practices', 'seo' ].forEach( c =>
				params.append( 'category', c )
			);
			if ( apiKey ) params.set( 'key', apiKey );

			const res = await fetch(
				`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${ params }`
			);

			if ( ! res.ok ) {
				results.push( {
					url, label,
					scores: {},
					issues: [ {
						category: 'Error',
						title: `PageSpeed API error ${ res.status }`,
						description: res.statusText,
						displayValue: '',
					} ],
				} );
				continue;
			}

			const data = await res.json() as {
				lighthouseResult?: {
					categories?: Record<string, { score?: number }>;
					audits?: Record<string, {
						score:        number | null;
						title:        string;
						description:  string;
						displayValue: string;
						details?:     { type: string };
					}>;
				};
			};

			const cats = data.lighthouseResult?.categories ?? {};
			const audits = data.lighthouseResult?.audits ?? {};

			const scores: Record<string, number> = {};
			for ( const [ key, cat ] of Object.entries( cats ) ) {
				scores[ key ] = Math.round( ( cat.score ?? 0 ) * 100 );
			}

			// Collect failed/warn audits as issues
			const issues: PageSpeedResult['issues'] = [];
			for ( const audit of Object.values( audits ) ) {
				if (
					audit.score !== null &&
					audit.score < 0.9 &&
					audit.title &&
					audit.displayValue
				) {
					issues.push( {
						category:     'Performance',
						title:        audit.title,
						description:  audit.description?.replace( /\[.*?\]\(.*?\)/g, '' ).trim() ?? '',
						displayValue: audit.displayValue,
					} );
				}
			}

			results.push( { url, label, scores, issues: issues.slice( 0, 10 ) } );

		} catch ( err ) {
			results.push( {
				url, label,
				scores: {},
				issues: [ {
					category: 'Error',
					title: 'Scan failed',
					description: String( err ),
					displayValue: '',
				} ],
			} );
		}
	}

	return results;
}

/* --------------------------------------------------
   Format helpers — make Angie responses readable
   -------------------------------------------------- */
function formatHistory( history: unknown[] ): string {
	if ( ! history.length ) return 'No scan history found.';

	return history.map( ( entry: unknown ) => {
		const e = entry as {
			id: string;
			date: string;
			strategy: string;
			results?: Array<{
				url: string;
				label: string;
				scores: Record<string, number>;
				issues?: Array<{ title: string; displayValue: string }>;
			}>;
		};

		const lines = [
			`Scan: ${ e.date } (${ e.strategy })`,
			'',
		];

		for ( const r of ( e.results ?? [] ) ) {
			const s = r.scores ?? {};
			lines.push(
				`${ r.label } (${ r.url })`,
				`  Performance: ${ s.performance ?? 'n/a' } | Accessibility: ${ s.accessibility ?? 'n/a' } | Best Practices: ${ s['best-practices'] ?? 'n/a' } | SEO: ${ s.seo ?? 'n/a' }`,
			);
			if ( r.issues?.length ) {
				lines.push( `  Issues: ${ r.issues.map( i => `${ i.title } (${ i.displayValue })` ).join( '; ' ) }` );
			}
			lines.push( '' );
		}

		return lines.join( '\n' );
	} ).join( '\n---\n' );
}

/* --------------------------------------------------
   MCP Server
   -------------------------------------------------- */
function createLighthouseMcpServer(): McpServer {
	const server = new McpServer(
		{
			name:    'lighthouse-scanner',
			version: window.lhscAngie?.version ?? '2.1.0',
		},
		{
			capabilities: { tools: {} },
			instructions: `
Guidelines for the Lighthouse Scanner server.

### Capabilities:
- **Get tracked URLs**: List all pages the scanner monitors
- **Get scan history**: Retrieve past Lighthouse/PageSpeed scan results with scores and issues
- **Run a scan**: Trigger a full PageSpeed Insights scan across all tracked pages and save results

### When to use:
- User asks about site performance, Lighthouse scores, or PageSpeed results
- User wants to know which pages have issues or have regressed
- User asks to run a performance scan or check site health
- User asks about accessibility, SEO, or best practices scores

### Limitations:
- Cannot modify theme or plugin files
- Cannot fix performance issues directly — only report them
- Running a scan requires a PageSpeed API key to be configured in the plugin settings
- Scans take time proportional to the number of pages (roughly 5–10 seconds per page)
`,
		}
	);

	/* ---- Tool: get-lighthouse-urls ---- */
	server.registerTool(
		'get-lighthouse-urls',
		{
			description: 'Returns the list of pages tracked by the Lighthouse Scanner. Call this to see which URLs will be included in a scan.',
			inputSchema: {},
			annotations: { readOnlyHint: true },
		},
		async () => {
			const urls = await restGet( '/urls' ) as Array<{ url: string; label: string }>;
			const text = urls.length
				? `Tracked pages (${ urls.length }):\n` + urls.map( u => `• ${ u.label }: ${ u.url }` ).join( '\n' )
				: 'No URLs are currently configured.';
			return { content: [ { type: 'text', text } ] };
		}
	);

	/* ---- Tool: get-lighthouse-history ---- */
	server.registerTool(
		'get-lighthouse-history',
		{
			description: 'Retrieves stored Lighthouse scan history including scores for Performance, Accessibility, Best Practices, and SEO for each page. Use this to check current scores, identify regressions, or answer questions about site performance.',
			inputSchema: {
				limit:    z.number().min( 1 ).max( 20 ).optional().describe( 'Number of past scans to return (default: 3)' ),
				strategy: z.enum( [ 'mobile', 'desktop' ] ).optional().describe( 'Filter by scan strategy (default: mobile)' ),
				url:      z.string().optional().describe( 'Filter results to a specific page URL' ),
			},
			annotations: { readOnlyHint: true },
		},
		async ( { limit = 3, strategy, url } ) => {
			const params = new URLSearchParams();
			params.set( 'limit', String( limit ) );
			if ( strategy ) params.set( 'strategy', strategy );
			if ( url ) params.set( 'url', url );

			const history = await restGet( `/history?${ params }` ) as unknown[];
			const text = formatHistory( history );
			return { content: [ { type: 'text', text } ] };
		}
	);

	/* ---- Tool: run-lighthouse-scan ---- */
	server.registerTool(
		'run-lighthouse-scan',
		{
			description: 'Runs a PageSpeed Insights scan on all tracked pages and saves the results to scan history. This takes approximately 5–10 seconds per page. Requires a PageSpeed API key to be configured in the Lighthouse Scanner plugin settings.',
			inputSchema: {
				strategy: z.enum( [ 'mobile', 'desktop' ] ).optional().describe( 'Scan strategy (default: mobile)' ),
			},
		},
		async ( { strategy = 'mobile' } ) => {
			const apiKey = window.lhscAngie?.apiKey ?? '';

			// Get URLs
			const urls = await restGet( '/urls' ) as Array<{ url: string; label: string }>;
			if ( ! urls.length ) {
				return { content: [ { type: 'text', text: 'No pages are configured for scanning.' } ] };
			}

			if ( ! apiKey ) {
				return {
					content: [ {
						type: 'text',
						text: 'A PageSpeed Insights API key is required to run scans. Please add your API key in the Lighthouse Scanner settings (Tools → Lighthouse Scanner → Setup).',
					} ],
				};
			}

			// Run scans
			const results = await runPageSpeedScan( urls, strategy, apiKey );

			// Save to history
			const scanId = 'angie_' + Date.now();
			await restPost( '/scan', {
				id:        scanId,
				date:      new Date().toLocaleDateString( 'en-US', { month: 'short', day: 'numeric', year: 'numeric' } ),
				timestamp: Math.floor( Date.now() / 1000 ),
				strategy,
				results,
			} );

			// Format summary
			const lines = [
				`Scan complete — ${ results.length } page${ results.length !== 1 ? 's' : '' } scanned (${ strategy })`,
				'',
			];

			for ( const r of results ) {
				const s = r.scores ?? {};
				lines.push(
					`${ r.label }`,
					`  Performance: ${ s.performance ?? 'n/a' } | Accessibility: ${ s.accessibility ?? 'n/a' } | Best Practices: ${ s['best-practices'] ?? 'n/a' } | SEO: ${ s.seo ?? 'n/a' }`,
				);
				if ( r.issues?.length ) {
					lines.push( `  Top issues: ${ r.issues.slice( 0, 3 ).map( i => i.title ).join( ', ' ) }` );
				}
				lines.push( '' );
			}

			lines.push( 'Results saved to scan history.' );

			return { content: [ { type: 'text', text: lines.join( '\n' ) } ] };
		}
	);

	return server;
}

/* --------------------------------------------------
   Register with Angie
   -------------------------------------------------- */
async function init() {
	try {
		const server = createLighthouseMcpServer();
		const sdk    = new AngieMcpSdk();
		await sdk.waitForReady();
		await sdk.registerServer( {
			name:        'lighthouse-scanner',
			version:     window.lhscAngie?.version ?? '2.1.0',
			description: 'Lighthouse Scanner — check PageSpeed scores, view scan history, and run new scans across all pages.',
			server,
		} );
		console.log( '[Lighthouse Scanner] Angie MCP server registered.' );
	} catch ( err ) {
		console.error( '[Lighthouse Scanner] Failed to register Angie MCP server:', err );
	}
}

init();
