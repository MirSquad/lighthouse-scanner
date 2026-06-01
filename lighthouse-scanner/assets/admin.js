/* global lhscData */
( function () {
	'use strict';

	/* ── State ─────────────────────────────────────────── */
	var urls       = [];
	var results    = [];
	var history    = [];
	var prevScores = {};
	var apiKey     = '';
	var threshold  = 85;
	var isRunning  = false;
	var searchTimer;

	var CAT = {
		performance      : 'Performance',
		accessibility    : 'Accessibility',
		'best-practices' : 'Best Practices',
		seo              : 'SEO'
	};

	/* ── Init ───────────────────────────────────────────── */
	document.addEventListener( 'DOMContentLoaded', function () {
		if ( typeof lhscData === 'undefined' ) return;

		apiKey     = lhscData.apiKey    || '';
		threshold  = lhscData.threshold || 85;
		prevScores = lhscData.prevScores || {};
		history    = lhscData.history   || [];

		urls = ( lhscData.urls || [] ).map( function ( u ) {
			return { url: u.url, label: decodeEntities( u.label ) };
		} );

		// "Scan this page" from admin bar — override URL list with just this URL
		if ( lhscData.scanThisUrl ) {
			urls = [ { url: lhscData.scanThisUrl, label: urlToLabel( lhscData.scanThisUrl ) } ];
		}
		if ( ! lhscData.setupDone ) {
			bindSetup();
		} else {
			showMain();
		}
	} );

	/* ── Setup card ─────────────────────────────────────── */
	function bindSetup() {
		var autoBtn   = document.getElementById( 'lhsc-setup-auto' );
		var manualBtn = document.getElementById( 'lhsc-setup-manual' );
		var step1     = document.getElementById( 'lhsc-setup-step-1' );
		var step2     = document.getElementById( 'lhsc-setup-step-2' );
		var chosenAuto = false;

		function goStep2( auto ) {
			chosenAuto = auto;
			if ( step1 ) step1.style.display = 'none';
			if ( step2 ) step2.style.display = 'block';
		}

		if ( autoBtn )   autoBtn.addEventListener( 'click',   function() { goStep2( true ); } );
		if ( manualBtn ) manualBtn.addEventListener( 'click', function() { goStep2( false ); } );

		function finish( saveKey ) {
			var key = saveKey ? ( document.getElementById( 'lhsc-setup-api-key' )?.value.trim() || '' ) : '';
			var body = 'action=lhsc_complete_setup&nonce=' + lhscData.nonce + '&auto=' + ( chosenAuto ? '1' : '0' );
			if ( key ) body += '&api_key=' + encodeURIComponent( key );
			fetch( lhscData.ajaxUrl, {
				method  : 'POST',
				headers : { 'Content-Type': 'application/x-www-form-urlencoded' },
				body    : body
			} ).then( function () {
				if ( ! chosenAuto ) urls = [];
				if ( key ) apiKey = key; // update local state
				var card = document.getElementById( 'lhsc-setup-card' );
				if ( card ) card.style.display = 'none';
				showMain();
			} );
		}

		document.getElementById( 'lhsc-setup-finish' )?.addEventListener( 'click', function() { finish( true ); } );
		document.getElementById( 'lhsc-setup-skip-key' )?.addEventListener( 'click', function() { finish( false ); } );
	}

	function showMain() {
		var main = document.getElementById( 'lhsc-main' );
		if ( main ) main.style.display = 'block';
		renderUrlList();
		bindSearch();
		bindEvents();
		renderHistory();
		if ( lhscData.autoRun || lhscData.scanThisUrl ) {
			setTimeout( function () {
				var btn = document.getElementById( 'lhsc-run' );
				if ( btn ) btn.click();
			}, 1000 );
		}
	}

	/* ── URL list ───────────────────────────────────────── */
	function renderUrlList() {
		var list = document.getElementById( 'lhsc-url-list' );
		if ( ! list ) return;
		if ( ! urls.length ) {
			list.innerHTML = '<p class="lhsc-no-urls">No URLs. Use the search box or "+ Add URL manually" below.</p>';
			return;
		}
		var header = '<div class="lhsc-url-header">'
			+ '<label class="lhsc-select-all-label">'
			+ '<input type="checkbox" id="lhsc-select-all" checked> Select all'
			+ '</label></div>';

		var rows = urls.map( function ( item, i ) {
			return '<div class="lhsc-url-row">'
				+ '<label class="lhsc-url-check-label">'
				+ '<input type="checkbox" class="lhsc-url-check" data-index="' + i + '" checked>'
				+ '<span class="lhsc-url-label">' + escHtml( item.label ) + '</span>'
				+ '</label>'
				+ '<span class="lhsc-url-text">' + escHtml( item.url ) + '</span>'
				+ '<button type="button" class="lhsc-remove-url" data-index="' + i + '" aria-label="Remove">&times;</button>'
				+ '</div>';
		} ).join( '' );

		list.innerHTML = header + rows;

		var selectAll = document.getElementById( 'lhsc-select-all' );
		selectAll.addEventListener( 'change', function () {
			list.querySelectorAll( '.lhsc-url-check' ).forEach( function ( cb ) {
				cb.checked = selectAll.checked;
			} );
		} );
		list.querySelectorAll( '.lhsc-url-check' ).forEach( function ( cb ) {
			cb.addEventListener( 'change', syncSelectAll );
		} );
		list.querySelectorAll( '.lhsc-remove-url' ).forEach( function ( btn ) {
			btn.addEventListener( 'click', function () {
				urls.splice( parseInt( this.dataset.index, 10 ), 1 );
				renderUrlList();
			} );
		} );
	}

	function syncSelectAll() {
		var list = document.getElementById( 'lhsc-url-list' );
		var all     = list.querySelectorAll( '.lhsc-url-check' );
		var checked = list.querySelectorAll( '.lhsc-url-check:checked' );
		var sa      = document.getElementById( 'lhsc-select-all' );
		if ( ! sa ) return;
		sa.checked       = all.length === checked.length;
		sa.indeterminate = checked.length > 0 && checked.length < all.length;
	}

	/* ── Autocomplete search ───────────────────────────── */
	function bindSearch() {
		var input   = document.getElementById( 'lhsc-search' );
		var results = document.getElementById( 'lhsc-search-results' );
		if ( ! input ) return;

		input.addEventListener( 'input', function () {
			clearTimeout( searchTimer );
			var term = this.value.trim();
			if ( term.length < 2 ) { results.style.display = 'none'; return; }
			searchTimer = setTimeout( function () { doSearch( term ); }, 300 );
		} );

		input.addEventListener( 'keydown', function ( e ) {
			if ( e.key === 'Escape' ) { results.style.display = 'none'; input.value = ''; }
		} );

		document.addEventListener( 'click', function ( e ) {
			if ( ! input.contains( e.target ) && ! results.contains( e.target ) ) {
				results.style.display = 'none';
			}
		} );
	}

	function doSearch( term ) {
		var res = document.getElementById( 'lhsc-search-results' );
		res.innerHTML = '<div class="lhsc-search-loading">Searching\u2026</div>';
		res.style.display = 'block';

		fetch( lhscData.ajaxUrl, {
			method  : 'POST',
			headers : { 'Content-Type': 'application/x-www-form-urlencoded' },
			body    : 'action=lhsc_search_posts&nonce=' + lhscData.nonce + '&term=' + encodeURIComponent( term )
		} )
		.then( function ( r ) { return r.json(); } )
		.then( function ( data ) {
			var items = ( data.success && data.data.length ) ? data.data : [];
			var html  = items.map( function ( item ) {
				return '<div class="lhsc-search-item" data-url="' + escAttr( item.url ) + '" data-label="' + escAttr( item.title ) + '">'
					+ '<span class="lhsc-search-title">' + escHtml( item.title ) + '</span>'
					+ '<span class="lhsc-search-type">' + escHtml( item.type ) + '</span>'
					+ '</div>';
			} ).join( '' );

			// Always offer "add as custom URL" if input looks like a URL
			var looksLikeUrl = term.match( /^https?:\/\// ) || term.match( /\.(com|me|org|net|io|co)\b/ );
			if ( looksLikeUrl ) {
				var url = term.match( /^https?:\/\// ) ? term : 'https://' + term;
				html += '<div class="lhsc-search-item lhsc-search-item--custom" data-url="' + escAttr( url ) + '" data-label="' + escAttr( urlToLabel( url ) ) + '">'
					+ '<span class="lhsc-search-title">Add: ' + escHtml( url ) + '</span>'
					+ '<span class="lhsc-search-type">Custom URL</span>'
					+ '</div>';
			} else if ( ! items.length ) {
				html += '<div class="lhsc-search-empty">No pages found. Enter a full URL to add it directly.</div>';
			}

			res.innerHTML = html;

			res.querySelectorAll( '.lhsc-search-item' ).forEach( function ( el ) {
				el.addEventListener( 'click', function () {
					var url   = this.dataset.url;
					var label = this.dataset.label;
					if ( ! urls.some( function ( u ) { return u.url === url; } ) ) {
						urls.push( { url: url, label: label } );
						renderUrlList();
					}
					res.style.display = 'none';
					document.getElementById( 'lhsc-search' ).value = '';
				} );
			} );
		} )
		.catch( function () { res.innerHTML = '<div class="lhsc-search-empty">Search failed.</div>'; } );
	}

	/* ── Event bindings ─────────────────────────────────── */
	function bindEvents() {
		document.getElementById( 'lhsc-run' )?.addEventListener( 'click', runScans );
		document.getElementById( 'lhsc-copy' )?.addEventListener( 'click', copyReport );
		document.getElementById( 'lhsc-csv' )?.addEventListener( 'click', exportCsv );
		document.getElementById( 'lhsc-clear-history' )?.addEventListener( 'click', clearHistory );
	}

	function addUrlManual() {
		var raw = prompt( 'Enter URL:' );
		if ( ! raw ) return;
		var url = raw.trim();
		if ( ! url.match( /^https?:\/\// ) ) url = 'https://' + url;
		if ( ! urls.some( function ( u ) { return u.url === url; } ) ) {
			urls.push( { url: url, label: urlToLabel( url ) } );
			renderUrlList();
		}
	}

	/* ── Scan runner ────────────────────────────────────── */
	function runScans() {
		if ( isRunning ) return;

		var checked = document.querySelectorAll( '.lhsc-url-check:checked' );
		var toScan  = [];
		checked.forEach( function ( cb ) {
			var idx = parseInt( cb.dataset.index, 10 );
			if ( urls[ idx ] ) toScan.push( urls[ idx ] );
		} );
		if ( ! toScan.length ) return;

		isRunning = true;
		results   = [];
		var strategy = document.getElementById( 'lhsc-strategy' ).value;
		var runBtn   = document.getElementById( 'lhsc-run' );
		runBtn.disabled    = true;
		runBtn.textContent = 'Scanning\u2026';

		document.getElementById( 'lhsc-copy' ).style.display = 'none';
		document.getElementById( 'lhsc-csv' ).style.display  = 'none';
		document.getElementById( 'lhsc-copied' ).style.display = 'none';
		document.getElementById( 'lhsc-results' ).innerHTML  = '';

		// Progress list
		var prog = document.getElementById( 'lhsc-progress' );
		prog.style.display = 'block';
		prog.innerHTML = toScan.map( function ( item, i ) {
			return '<div class="lhsc-progress-row" id="lhpr-' + i + '">'
				+ '<span class="lhsc-dot lhsc-dot--waiting" id="lhpdot-' + i + '"></span>'
				+ '<span class="lhsc-progress-url">' + escHtml( item.url ) + '</span>'
				+ '<span class="lhsc-progress-status" id="lhpst-' + i + '">waiting</span>'
				+ '</div>';
		} ).join( '' );

		var delay  = apiKey ? 1000 : 15000;
		var chain  = Promise.resolve();
		toScan.forEach( function ( item, i ) {
			chain = chain
				.then( function () { return scanOne( item, i, strategy ); } )
				.then( function () { if ( i < toScan.length - 1 ) return wait( delay ); } );
		} );

		chain.finally( function () {
			isRunning          = false;
			runBtn.disabled    = false;
			runBtn.textContent = 'Run scans';
			if ( results.some( function ( r ) { return ! r.error; } ) ) {
				document.getElementById( 'lhsc-copy' ).style.display = 'inline-block';
				document.getElementById( 'lhsc-csv' ).style.display  = 'inline-block';
				saveHistory( results, strategy );
			}
		} );
	}

	function scanOne( item, i, strategy ) {
		setDot( i, 'running' );
		setSt( i, 'scanning\u2026' );
		return psiRequest( item.url, strategy, 3, i )
			.then( function ( data ) {
				var r = {
					url    : item.url,
					label  : item.label,
					scores : extractScores( data ),
					issues : extractIssues( data ),
					error  : null
				};
				results.push( r );
				setDot( i, 'done' );
				setSt( i, 'done' );
				renderResult( r );
			} )
			.catch( function ( err ) {
				var r = { url: item.url, label: item.label, scores: [], issues: [], error: err.message };
				results.push( r );
				setDot( i, 'error' );
				setSt( i, 'error' );
				renderResult( r );
			} );
	}

	function psiRequest( url, strategy, tries, i ) {
		var api = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'
			+ '?url=' + encodeURIComponent( url )
			+ '&strategy=' + encodeURIComponent( strategy )
			+ '&category=performance&category=accessibility&category=best-practices&category=seo'
			+ ( apiKey ? '&key=' + encodeURIComponent( apiKey ) : '' );
		return fetch( api ).then( function ( res ) {
			if ( res.status === 429 && tries > 1 ) {
				var w = ( 4 - tries ) * 10000;
				setSt( i, 'rate limited\u2026' );
				return wait( w ).then( function () {
					setSt( i, 'retrying\u2026' );
					return psiRequest( url, strategy, tries - 1, i );
				} );
			}
			if ( ! res.ok ) throw new Error( 'API error ' + res.status );
			return res.json();
		} );
	}

	/* ── Parse PSI response ─────────────────────────────── */
	function extractScores( data ) {
		var cats = ( data.lighthouseResult || {} ).categories || {};
		var out  = {};
		Object.keys( CAT ).forEach( function ( id ) {
			out[ id ] = cats[ id ] ? cats[ id ].score : null;
		} );
		return out;
	}

	function extractIssues( data ) {
		var issues = [];
		var cats   = ( ( data.lighthouseResult || {} ).categories ) || {};
		var audits = ( ( data.lighthouseResult || {} ).audits )     || {};
		Object.keys( cats ).forEach( function ( catId ) {
			( cats[ catId ].auditRefs || [] ).forEach( function ( ref ) {
				var a = audits[ ref.id ];
				if ( ! a ) return;
				if ( a.scoreDisplayMode === 'notApplicable' || a.scoreDisplayMode === 'informative' ) return;
				if ( a.score === null || a.score === undefined || a.score >= 0.9 ) return;
				// Capture up to 5 resource-level items for opportunity/table audits
				// so we know exactly which images/scripts are flagged.
				var items = [];
				if ( a.details && Array.isArray( a.details.items ) ) {
					items = a.details.items.slice( 0, 5 ).map( function ( item ) {
						return {
							url         : item.url || ( item.node && item.node.snippet ) || '',
							wastedBytes : item.wastedBytes  || 0,
							wastedMs    : item.wastedMs     || 0,
						};
					} ).filter( function ( item ) { return item.url || item.wastedBytes || item.wastedMs; } );
				}
				issues.push( {
					category    : CAT[ catId ] || catId,
					title       : a.title || '',
					description : ( a.description || '' ).split( '.' )[ 0 ],
					displayValue: a.displayValue || '',
					score       : a.score,
					items       : items,
				} );
			} );
		} );
		return issues;
	}

	/* ── Render results ─────────────────────────────────── */
	function renderResult( r ) {
		var el   = document.getElementById( 'lhsc-results' );
		var card = document.createElement( 'div' );
		card.className = 'lhsc-result-card';

		var scoresHtml = Object.keys( CAT ).map( function ( id ) {
			var s     = r.scores[ id ];
			var score = s !== null && s !== undefined ? Math.round( s * 100 ) : '\u2014';
			var cls   = scoreClass( s );
			var delta = '';
			if ( s !== null && prevScores[ r.url ] && prevScores[ r.url ][ id ] !== undefined ) {
				var diff = Math.round( s * 100 ) - Math.round( prevScores[ r.url ][ id ] * 100 );
				if ( diff !== 0 ) {
					delta = '<span class="lhsc-delta ' + ( diff > 0 ? 'lhsc-delta--up' : 'lhsc-delta--down' ) + '">'
						+ ( diff > 0 ? '+' : '' ) + diff + '</span>';
				}
			}
			return '<span class="lhsc-score lhsc-score--' + cls + '">'
				+ escHtml( CAT[ id ] ) + ' ' + score + delta
				+ '</span>';
		} ).join( '' );

		var body = '';
		if ( r.error ) {
			body = '<p class="lhsc-error">Error: ' + escHtml( r.error ) + '</p>';
		} else if ( ! r.issues.length ) {
			body = '<p class="lhsc-no-issues">No failing audits.</p>';
		} else {
			body = r.issues.map( function ( iss ) {
				var itemsHtml = '';
				if ( iss.items && iss.items.length ) {
					itemsHtml = '<ul class="lhsc-issue-items">' + iss.items.map( function ( item ) {
						var savings = '';
						if ( item.wastedBytes ) savings = ' (' + Math.round( item.wastedBytes / 1024 ) + ' KiB)';
						else if ( item.wastedMs ) savings = ' (' + Math.round( item.wastedMs ) + ' ms)';
						return '<li>' + escHtml( item.url ) + escHtml( savings ) + '</li>';
					} ).join( '' ) + '</ul>';
				}
				return '<div class="lhsc-issue">'
					+ '<div class="lhsc-issue-cat">' + escHtml( iss.category ) + '</div>'
					+ '<div class="lhsc-issue-title">' + escHtml( iss.title )
					+ ( iss.displayValue ? ' \u2014 ' + escHtml( iss.displayValue ) : '' ) + '</div>'
					+ ( iss.description ? '<div class="lhsc-issue-desc">' + escHtml( iss.description ) + '</div>' : '' )
					+ itemsHtml
					+ '</div>';
			} ).join( '' );
		}

		card.innerHTML = '<div class="lhsc-result-header">'
			+ '<span class="lhsc-result-url">' + escHtml( r.url ) + '</span>'
			+ '<span class="lhsc-result-label">' + escHtml( r.label ) + '</span>'
			+ '<div class="lhsc-scores">' + scoresHtml + '</div>'
			+ '</div>'
			+ '<div class="lhsc-result-body">' + body + '</div>';

		el.appendChild( card );
	}

	/* ── History ────────────────────────────────────────── */
	function saveHistory( scanResults, strategy ) {
		var now  = new Date();
		var scan = {
			id        : now.getTime().toString(),
			date      : now.toLocaleDateString( 'en-US', { month: 'short', day: 'numeric', year: 'numeric' } ),
			timestamp : Math.floor( now.getTime() / 1000 ),
			strategy  : strategy,
			results   : scanResults.filter( function ( r ) { return ! r.error; } ).map( function ( r ) {
				return { url: r.url, label: r.label, scores: r.scores, issues: r.issues };
			} )
		};
		fetch( lhscData.ajaxUrl, {
			method  : 'POST',
			headers : { 'Content-Type': 'application/x-www-form-urlencoded' },
			body    : 'action=lhsc_save_history&nonce=' + lhscData.nonce + '&scan=' + encodeURIComponent( JSON.stringify( scan ) )
		} ).then( function () {
			history.unshift( scan );
			if ( history.length > 20 ) history = history.slice( 0, 20 );
			prevScores = {};
			( scan.results || [] ).forEach( function ( r ) { prevScores[ r.url ] = r.scores; } );
			renderHistory();
		} );
	}

	function renderHistory() {
		var card = document.getElementById( 'lhsc-history-card' );
		if ( ! history.length ) { if ( card ) card.style.display = 'none'; return; }
		if ( card ) card.style.display = 'block';
		renderGraph();
		renderHistoryList();
	}

	function renderHistoryList() {
		var el = document.getElementById( 'lhsc-history-list' );
		if ( ! el ) return;
		el.innerHTML = history.map( function ( scan, si ) {
			var scores = scan.results.map( function ( r ) {
				var perf = r.scores.performance;
				var s    = perf !== null ? Math.round( perf * 100 ) : '\u2014';
				var cls  = scoreClass( perf );
				return '<span class="lhsc-score lhsc-score--' + cls + ' lhsc-score--sm">' + escHtml( r.label ) + ' ' + s + '</span>';
			} ).join( '' );
			return '<div class="lhsc-history-row" id="lhh-' + si + '">'
				+ '<div class="lhsc-history-row-header" data-target="lhh-body-' + si + '">'
				+ '<span class="lhsc-history-date">' + escHtml( scan.date ) + ' <small>(' + escHtml( scan.strategy ) + ')</small></span>'
				+ '<div class="lhsc-history-scores">' + scores + '</div>'
				+ '<span class="lhsc-history-toggle">&#9660;</span>'
				+ '</div>'
				+ '<div class="lhsc-history-body" id="lhh-body-' + si + '" style="display:none">'
				+ renderHistoryScanDetail( scan )
				+ '</div>'
				+ '</div>';
		} ).join( '' );

		el.querySelectorAll( '.lhsc-history-row-header' ).forEach( function ( hdr ) {
			hdr.addEventListener( 'click', function () {
				var body   = document.getElementById( this.dataset.target );
				var toggle = this.querySelector( '.lhsc-history-toggle' );
				if ( ! body ) return;
				var open = body.style.display !== 'none';
				body.style.display    = open ? 'none' : 'block';
				toggle.innerHTML      = open ? '&#9660;' : '&#9650;';
			} );
		} );
	}

	function renderHistoryScanDetail( scan ) {
		return scan.results.map( function ( r ) {
			var pills = Object.keys( CAT ).map( function ( id ) {
				var s = r.scores[ id ];
				return '<span class="lhsc-score lhsc-score--' + scoreClass( s ) + ' lhsc-score--sm">'
					+ escHtml( CAT[ id ] ) + ' ' + ( s !== null ? Math.round( s * 100 ) : '\u2014' )
					+ '</span>';
			} ).join( '' );
			return '<div class="lhsc-history-detail-row">'
				+ '<span class="lhsc-history-detail-label">' + escHtml( r.label ) + '</span>'
				+ '<div>' + pills + '</div>'
				+ '</div>';
		} ).join( '' );
	}

	/* ── Graph (sparklines) ─────────────────────────────── */
	function renderGraph() {
		var el = document.getElementById( 'lhsc-graph' );
		if ( ! el || history.length < 2 ) { if ( el ) el.innerHTML = ''; return; }

		// Collect all unique URLs
		var allUrls = {};
		history.forEach( function ( scan ) {
			scan.results.forEach( function ( r ) { allUrls[ r.url ] = r.label; } );
		} );

		// For each URL, collect performance scores across scans (oldest→newest)
		var reversed = history.slice().reverse();
		var colors   = [ '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4' ];
		var W = 400, H = 100, PAD = 20;
		var plotW = W - PAD * 2, plotH = H - PAD * 2;

		var lines = Object.keys( allUrls ).map( function ( url, idx ) {
			var pts = reversed.map( function ( scan ) {
				var r = scan.results.find( function ( r ) { return r.url === url; } );
				return r && r.scores.performance !== null ? Math.round( r.scores.performance * 100 ) : null;
			} ).filter( function ( v ) { return v !== null; } );
			if ( pts.length < 2 ) return '';
			var n  = pts.length;
			var color = colors[ idx % colors.length ];
			var points = pts.map( function ( v, i ) {
				var x = PAD + ( i / ( n - 1 ) ) * plotW;
				var y = PAD + ( 1 - ( v - 50 ) / 50 ) * plotH;
				y = Math.max( PAD, Math.min( H - PAD, y ) );
				return x.toFixed(1) + ',' + y.toFixed(1);
			} ).join( ' ' );
			var label = allUrls[ url ];
			return '<polyline points="' + points + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linejoin="round"/>'
				+ '<text x="' + ( PAD + plotW + 4 ) + '" y="' + ( PAD + ( ( 1 - ( pts[ pts.length - 1 ] - 50 ) / 50 ) * plotH ) ).toFixed(1) + '" fill="' + color + '" font-size="9" dominant-baseline="middle">' + escHtml( label.substring( 0, 18 ) ) + '</text>';
		} ).join( '' );

		// Axis labels
		var dateLabels = reversed.map( function ( scan, i ) {
			if ( i === 0 || i === reversed.length - 1 ) {
				var x = PAD + ( i / ( reversed.length - 1 ) ) * plotW;
				return '<text x="' + x.toFixed(1) + '" y="' + ( H - 4 ) + '" fill="#888" font-size="8" text-anchor="middle">' + escHtml( scan.date.split(',')[0] ) + '</text>';
			}
			return '';
		} ).join( '' );

		el.innerHTML = '<p style="font-size:12px;color:#646970;margin-bottom:8px;">Performance score over time</p>'
			+ '<svg viewBox="0 0 500 ' + H + '" style="width:100%;max-width:500px;overflow:visible">'
			+ '<line x1="' + PAD + '" y1="' + PAD + '" x2="' + PAD + '" y2="' + ( H - PAD ) + '" stroke="#e0e0e0" stroke-width="1"/>'
			+ '<line x1="' + PAD + '" y1="' + ( H - PAD ) + '" x2="' + ( PAD + plotW ) + '" y2="' + ( H - PAD ) + '" stroke="#e0e0e0" stroke-width="1"/>'
			+ '<text x="' + ( PAD - 2 ) + '" y="' + PAD + '" fill="#888" font-size="8" text-anchor="end">100</text>'
			+ '<text x="' + ( PAD - 2 ) + '" y="' + ( PAD + plotH ) + '" fill="#888" font-size="8" text-anchor="end">50</text>'
			+ lines + dateLabels
			+ '</svg>';
	}

	/* ── Clear history ──────────────────────────────────── */
	function clearHistory() {
		if ( ! confirm( 'Clear all scan history?' ) ) return;
		fetch( lhscData.ajaxUrl, {
			method  : 'POST',
			headers : { 'Content-Type': 'application/x-www-form-urlencoded' },
			body    : 'action=lhsc_clear_history&nonce=' + lhscData.nonce
		} ).then( function () {
			history = [];
			renderHistory();
		} );
	}

	/* ── Copy report for Claude ─────────────────────────── */
	function copyReport() {
		var text = 'Lighthouse scan results \u2014 ' + new Date().toLocaleDateString() + '\n\n';
		results.forEach( function ( r ) {
			text += '## ' + r.url + '\n';
			if ( r.error ) { text += 'Error: ' + r.error + '\n\n'; return; }
			text += Object.keys( CAT ).map( function ( id ) {
				var s = r.scores[ id ];
				return CAT[ id ] + ': ' + ( s !== null ? Math.round( s * 100 ) : '\u2014' );
			} ).join( ' | ' ) + '\n\n';
			if ( ! r.issues.length ) {
				text += 'No failing audits.\n\n';
			} else {
				r.issues.forEach( function ( iss ) {
					text += '[' + iss.category + '] ' + iss.title;
					if ( iss.displayValue ) text += ' (' + iss.displayValue + ')';
					text += '\n';
					if ( iss.description ) text += '  ' + iss.description + '\n';
				} );
				text += '\n';
			}
		} );

		if ( navigator.clipboard ) {
			navigator.clipboard.writeText( text ).then( showCopied );
		} else {
			var ta = document.createElement( 'textarea' );
			ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
			document.body.appendChild( ta ); ta.select(); document.execCommand( 'copy' );
			document.body.removeChild( ta ); showCopied();
		}
	}

	function showCopied() {
		var el = document.getElementById( 'lhsc-copied' );
		if ( ! el ) return;
		el.style.display = 'block';
		setTimeout( function () { el.style.display = 'none'; }, 2500 );
	}

	/* ── Export CSV ─────────────────────────────────────── */
	function exportCsv() {
		var rows = [ [ 'URL', 'Label', 'Performance', 'Accessibility', 'Best Practices', 'SEO', 'Issues', 'Scan date' ] ];
		var date = new Date().toLocaleDateString();
		results.forEach( function ( r ) {
			if ( r.error ) return;
			rows.push( [
				r.url, r.label,
				r.scores.performance    !== null ? Math.round( r.scores.performance    * 100 ) : '',
				r.scores.accessibility  !== null ? Math.round( r.scores.accessibility  * 100 ) : '',
				r.scores['best-practices'] !== null ? Math.round( r.scores['best-practices'] * 100 ) : '',
				r.scores.seo            !== null ? Math.round( r.scores.seo            * 100 ) : '',
				r.issues.map( function ( i ) { return '[' + i.category + '] ' + i.title; } ).join( ' | ' ),
				date
			] );
		} );
		var csv  = rows.map( function ( row ) {
			return row.map( function ( v ) { return '"' + String( v ).replace( /"/g, '""' ) + '"'; } ).join( ',' );
		} ).join( '\n' );
		var blob = new Blob( [ csv ], { type: 'text/csv' } );
		var a    = document.createElement( 'a' );
		a.href   = URL.createObjectURL( blob );
		a.download = 'lighthouse-scan-' + new Date().toISOString().slice( 0, 10 ) + '.csv';
		a.click();
	}

	/* ── Helpers ────────────────────────────────────────── */
	function scoreClass( s ) {
		if ( s === null || s === undefined ) return 'ok';
		var score = Math.round( s * 100 );
		if ( score < threshold ) return 'bad';
		if ( score >= 90 ) return 'good';
		return 'ok';
	}

	function setDot( i, state ) {
		var el = document.getElementById( 'lhpdot-' + i );
		if ( el ) el.className = 'lhsc-dot lhsc-dot--' + state;
	}
	function setSt( i, text ) {
		var el = document.getElementById( 'lhpst-' + i );
		if ( el ) el.textContent = text;
	}
	function wait( ms ) { return new Promise( function ( r ) { setTimeout( r, ms ); } ); }
	function urlToLabel( url ) {
		try { var p = new URL( url ).pathname.replace( /\//g, '' ).replace( /-/g, ' ' ); return p || 'Home'; }
		catch ( e ) { return url; }
	}
	function decodeEntities( str ) {
		var ta = document.createElement( 'textarea' );
		ta.innerHTML = str; return ta.value;
	}
	function escHtml( s ) {
		return String( s ).replace( /&/g,'&amp;' ).replace( /</g,'&lt;' ).replace( />/g,'&gt;' ).replace( /"/g,'&quot;' ).replace( /'/g,'&#039;' );
	}
	function escAttr( s ) { return escHtml( s ); }

} )();
