/* Lighthouse Scanner — Admin Bar v2.0.2 */
( function () {
	'use strict';

	if ( typeof lhscBarData === 'undefined' ) return;
	if ( ! lhscBarData.currentUrl ) return;

	var CAT      = { performance: 'Perf', accessibility: 'A11y', 'best-practices': 'BP', seo: 'SEO' };
	var scanning = false;
	var overlay  = null;

	// Strip hash fragment from URL
	var currentUrl = lhscBarData.currentUrl.split('#')[0].split('?')[0];
	// Re-add trailing slash if missing
	if ( ! currentUrl.match( /\.\w+$/ ) && ! currentUrl.endsWith('/') ) currentUrl += '/';

	function init() {
		// Create overlay
		overlay = document.createElement( 'div' );
		overlay.id = 'lhsc-bar-overlay';
		overlay.setAttribute( 'style', [
			'display:none', 'position:fixed', 'top:46px', 'right:16px',
			'z-index:100000', 'background:#1d2327', 'border-radius:4px',
			'padding:14px 16px', 'min-width:260px', 'max-width:320px',
			'box-shadow:0 4px 20px rgba(0,0,0,0.5)',
			'color:#fff', "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
			'font-size:12px', 'line-height:1.5'
		].join(';') );
		document.body.appendChild( overlay );

		// Attach click handler to "Scan this page" item
		attachScanHandler();

		// Close overlay on outside click
		document.addEventListener( 'click', function ( e ) {
			if ( ! overlay ) return;
			if ( overlay.contains( e.target ) ) return;
			var scanItem = document.getElementById( 'wp-admin-bar-lhsc-bar-scan-page' );
			if ( scanItem && scanItem.contains( e.target ) ) return;
			overlay.style.display = 'none';
		} );
	}

	function attachScanHandler() {
		var item = document.getElementById( 'wp-admin-bar-lhsc-bar-scan-page' );
		if ( ! item ) return;

		// Override the href so clicking doesn't add # to URL
		var link = item.querySelector( 'a.ab-item' );
		if ( link ) link.href = 'javascript:void(0)'; // eslint-disable-line no-script-url

		item.addEventListener( 'click', function ( e ) {
			e.preventDefault();
			e.stopImmediatePropagation();
			if ( scanning ) return;

			// Close admin bar dropdown
			var topItem = document.getElementById( 'wp-admin-bar-lhsc-bar' );
			if ( topItem ) {
				topItem.classList.remove( 'hover' );
				topItem.blur();
			}

			startScan();
		}, true ); // use capture phase to fire before WP's own handlers
	}

	function startScan() {
		scanning = true;
		setBarLabel( 'Scanning\u2026' );
		setSpinning( true );
		showOverlay(
			'<div style="display:flex;align-items:center;gap:8px;color:#a7aaad">'
			+ '<span style="animation:lhsc-spin 0.7s linear infinite;display:inline-block;font-size:14px">⚡</span>'
			+ '<span>Scanning ' + escHtml( currentUrl ) + '</span>'
			+ '</div>'
		);

		var api = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'
			+ '?url='      + encodeURIComponent( currentUrl )
			+ '&strategy=mobile'
			+ '&category=performance&category=accessibility&category=best-practices&category=seo'
			+ ( lhscBarData.apiKey ? '&key=' + encodeURIComponent( lhscBarData.apiKey ) : '' );

		fetch( api )
			.then( function ( r ) {
				if ( ! r.ok ) throw new Error( 'HTTP ' + r.status );
				return r.json();
			} )
			.then( function ( data ) {
				var cats = ( ( data.lighthouseResult || {} ).categories ) || {};
				var scores = {};
				Object.keys( CAT ).forEach( function ( id ) {
					scores[ id ] = cats[ id ] ? Math.round( cats[ id ].score * 100 ) : null;
				} );
				showResults( scores );
			} )
			.catch( function ( err ) {
				showOverlay(
					'<div style="color:#f86368;margin-bottom:8px">Scan failed: ' + escHtml( err.message ) + '</div>'
					+ '<div style="color:#a7aaad;font-size:11px;margin-bottom:8px">URL scanned: ' + escHtml( currentUrl ) + '</div>'
					+ '<a href="' + escHtml( lhscBarData.pluginPage ) + '" style="color:#72aee6;font-size:11px">'
					+ 'Open full scanner \u2192</a>'
				);
			} )
			.finally( function () {
				scanning = false;
				setSpinning( false );
				setBarLabel( ' Scan' );
			} );
	}

	function showResults( scores ) {
		var colorMap = {
			good : 'background:#d1fae5;color:#065f46',
			ok   : 'background:#fef3c7;color:#92400e',
			bad  : 'background:#fee2e2;color:#991b1b'
		};
		var pills = Object.keys( CAT ).map( function ( id ) {
			var s   = scores[ id ];
			var key = s === null ? 'ok' : ( s >= 90 ? 'good' : ( s >= 50 ? 'ok' : 'bad' ) );
			return '<span style="' + colorMap[ key ] + ';display:inline-block;padding:2px 8px;'
				+ 'border-radius:20px;font-weight:600;font-size:11px;margin:2px 2px 2px 0">'
				+ escHtml( CAT[ id ] ) + ' ' + ( s !== null ? s : '\u2014' )
				+ '</span>';
		} ).join( '' );

		showOverlay(
			'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">'
			+ '<div style="font-size:10px;color:#a7aaad;word-break:break-all;flex:1;padding-right:8px">' + escHtml( currentUrl ) + '</div>'
			+ '<span id="lhsc-overlay-close" style="cursor:pointer;color:#a7aaad;font-size:20px;line-height:1;flex-shrink:0;margin-top:-3px">&times;</span>'
			+ '</div>'
			+ '<div style="margin-bottom:10px">' + pills + '</div>'
			+ '<a href="' + escHtml( lhscBarData.pluginPage ) + '" style="color:#72aee6;font-size:11px;text-decoration:none">'
			+ 'Full report \u2192</a>'
		);

		var closeBtn = document.getElementById( 'lhsc-overlay-close' );
		if ( closeBtn ) {
			closeBtn.addEventListener( 'click', function (e) {
				e.stopPropagation();
				overlay.style.display = 'none';
			} );
		}
	}

	function showOverlay( html ) {
		if ( ! overlay ) return;
		overlay.innerHTML = html;
		overlay.style.display = 'block';
	}

	function setBarLabel( text ) {
		var el = document.querySelector( '#wp-admin-bar-lhsc-bar > .ab-item .lhsc-bar-label' );
		if ( el ) el.textContent = text;
	}

	function setSpinning( on ) {
		var icon = document.getElementById( 'lhsc-bar-icon' );
		if ( ! icon ) return;
		icon.style.display         = 'inline-block';
		icon.style.transformOrigin = 'center';
		icon.style.animation       = on ? 'lhsc-spin 0.7s linear infinite' : 'none';
	}

	function escHtml( s ) {
		return String( s )
			.replace( /&/g, '&amp;' ).replace( /</g, '&lt;' )
			.replace( />/g, '&gt;' ).replace( /"/g, '&quot;' );
	}

	// Run init — try immediately, also on DOMContentLoaded as fallback
	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}

} )();
