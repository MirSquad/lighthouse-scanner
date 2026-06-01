<?php
/**
 * WordPress Abilities API integration for Lighthouse Scanner.
 * Requires WP 6.9+ (Abilities API). Does nothing on older versions.
 *
 * Read abilities are always registered.
 * Write abilities are only registered when "Enable write abilities" is on
 * in Tools > Lighthouse Scanner.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// Bail silently on WordPress versions that don't have the Abilities API.
if ( ! function_exists( 'wp_register_ability' ) ) {
	return;
}

// -------------------------------------------------------------------------
// Background scan — hooked into WP-Cron so it runs after run-scan returns.
// -------------------------------------------------------------------------
add_action( 'lhsc_ability_run_scan', 'lhsc_ability_do_scan' );
function lhsc_ability_do_scan( $strategy = 'mobile' ) {

	$strategy = ( $strategy === 'desktop' ) ? 'desktop' : 'mobile';
	$api_key  = lhsc_get_api_key();
	$urls     = lhsc_get_site_urls();

	if ( empty( $urls ) ) {
		return;
	}

	if ( function_exists( 'set_time_limit' ) ) {
		set_time_limit( 300 );
	}

	$cat_labels = array(
		'performance'    => 'Performance',
		'accessibility'  => 'Accessibility',
		'best-practices' => 'Best Practices',
		'seo'            => 'SEO',
	);

	$scan_results = array();

	foreach ( $urls as $item ) {
		// Build URL manually — add_query_arg encodes arrays as category[0]=...
		// which the PageSpeed API ignores. Repeated params are required.
		$api_url = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'
			. '?url=' . rawurlencode( $item['url'] )
			. '&strategy=' . rawurlencode( $strategy )
			. '&category=performance&category=accessibility&category=best-practices&category=seo'
			. ( $api_key ? '&key=' . rawurlencode( $api_key ) : '' );

		$response = wp_remote_get( $api_url, array( 'timeout' => 60, 'sslverify' => true ) );

		if ( is_wp_error( $response ) || wp_remote_retrieve_response_code( $response ) !== 200 ) {
			continue;
		}

		$data = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( empty( $data['lighthouseResult'] ) ) {
			continue;
		}

		$lhr    = $data['lighthouseResult'];
		$cats   = $lhr['categories'] ?? array();
		$audits = $lhr['audits'] ?? array();

		// Extract scores — mirrors browser extractScores().
		$scores = array();
		foreach ( $cat_labels as $cat_id => $cat_label ) {
			$scores[ $cat_id ] = isset( $cats[ $cat_id ]['score'] ) ? (float) $cats[ $cat_id ]['score'] : null;
		}

		// Extract failing audits — mirrors browser extractIssues().
		$issues = array();
		foreach ( $cats as $cat_id => $cat ) {
			foreach ( (array) ( $cat['auditRefs'] ?? array() ) as $ref ) {
				$audit = $audits[ $ref['id'] ] ?? null;
				if ( ! $audit ) continue;
				$mode = $audit['scoreDisplayMode'] ?? '';
				if ( $mode === 'notApplicable' || $mode === 'informative' ) continue;
				$score = $audit['score'] ?? null;
				if ( $score === null || $score >= 0.9 ) continue;

				// Capture up to 5 resource-level items for opportunity/table audits.
				$items = array();
				foreach ( array_slice( (array) ( $audit['details']['items'] ?? array() ), 0, 5 ) as $detail_item ) {
					$entry = array(
						'url'         => esc_url_raw( $detail_item['url'] ?? ( $detail_item['node']['snippet'] ?? '' ) ),
						'wastedBytes' => (int) ( $detail_item['wastedBytes'] ?? 0 ),
						'wastedMs'    => (int) ( $detail_item['wastedMs'] ?? 0 ),
					);
					if ( $entry['url'] || $entry['wastedBytes'] || $entry['wastedMs'] ) {
						$items[] = $entry;
					}
				}

				$issues[] = array(
					'category'     => $cat_labels[ $cat_id ] ?? $cat_id,
					'title'        => sanitize_text_field( $audit['title'] ?? '' ),
					'description'  => sanitize_text_field( explode( '.', $audit['description'] ?? '' )[0] ),
					'displayValue' => sanitize_text_field( $audit['displayValue'] ?? '' ),
					'items'        => $items,
				);
			}
		}

		$scan_results[] = array(
			'url'    => esc_url_raw( $item['url'] ),
			'label'  => sanitize_text_field( $item['label'] ),
			'scores' => $scores,
			'issues' => array_slice( $issues, 0, 20 ),
		);
	}

	if ( empty( $scan_results ) ) {
		return;
	}

	// Save to history — same format as browser saveHistory().
	$entry = array(
		'id'        => uniqid( 'ability_' ),
		'date'      => current_time( 'M j, Y' ),
		'timestamp' => time(),
		'strategy'  => $strategy,
		'results'   => $scan_results,
	);

	$history = lhsc_get_history();
	array_unshift( $history, $entry );
	update_option( LHSC_OPT_HISTORY, array_slice( $history, 0, 20 ), false );
}

// -------------------------------------------------------------------------
// Register category.
// -------------------------------------------------------------------------
add_action( 'wp_abilities_api_categories_init', 'lhsc_register_ability_category' );
function lhsc_register_ability_category() {
	wp_register_ability_category( 'lighthouse-scanner', array(
		'label'       => __( 'Lighthouse Scanner', 'lighthouse-scanner' ),
		'description' => __( 'Run PageSpeed Insights scans and read Lighthouse scan results.', 'lighthouse-scanner' ),
	) );
}

// -------------------------------------------------------------------------
// Register abilities.
// -------------------------------------------------------------------------
add_action( 'wp_abilities_api_init', 'lhsc_register_abilities' );
function lhsc_register_abilities() {

	// --- get-settings (always available) ---------------------------------

	wp_register_ability( 'lighthouse-scanner/get-settings', array(
		'label'       => __( 'Get Settings', 'lighthouse-scanner' ),
		'description' => __( 'Retrieve Lighthouse Scanner settings: score alert threshold and setup status. The API key is masked.', 'lighthouse-scanner' ),
		'category'    => 'lighthouse-scanner',
		'output_schema' => array(
			'type'       => 'object',
			'properties' => array(
				'threshold'   => array( 'type' => 'integer', 'description' => 'Score alert threshold (0–100).' ),
				'setup_done'  => array( 'type' => 'boolean' ),
				'api_key_set' => array( 'type' => 'boolean', 'description' => 'Whether a Google API key is saved.' ),
			),
		),
		'permission_callback' => fn() => current_user_can( 'manage_options' ),
		'execute_callback'    => function( $input = null ) {
			return array(
				'threshold'   => (int) get_option( LHSC_OPT_THRESHOLD, 85 ),
				'setup_done'  => (bool) get_option( LHSC_OPT_SETUP, false ),
				'api_key_set' => '' !== lhsc_get_api_key(),
			);
		},
		'meta' => array(
			'mcp'        => array( 'public' => true ),
			'annotations' => array( 'readonly' => true, 'destructive' => false, 'idempotent' => true ),
		),
	) );

	// --- get-urls (always available) -------------------------------------

	wp_register_ability( 'lighthouse-scanner/get-urls', array(
		'label'       => __( 'Get Scan URLs', 'lighthouse-scanner' ),
		'description' => __( 'Retrieve the list of URLs configured for Lighthouse scanning, with display labels.', 'lighthouse-scanner' ),
		'category'    => 'lighthouse-scanner',
		'output_schema' => array(
			'type'  => 'array',
			'items' => array(
				'type'       => 'object',
				'properties' => array(
					'url'   => array( 'type' => 'string' ),
					'label' => array( 'type' => 'string' ),
				),
			),
		),
		'permission_callback' => fn() => current_user_can( 'manage_options' ),
		'execute_callback'    => function( $input = null ) {
			return array_values( lhsc_get_site_urls() );
		},
		'meta' => array(
			'mcp'        => array( 'public' => true ),
			'annotations' => array( 'readonly' => true, 'destructive' => false, 'idempotent' => true ),
		),
	) );

	// --- get-history (always available) ----------------------------------

	wp_register_ability( 'lighthouse-scanner/get-history', array(
		'label'       => __( 'Get Scan History', 'lighthouse-scanner' ),
		'description' => __( 'Retrieve Lighthouse scan history. Returns up to 20 entries, newest first. Each entry includes URL, scores, strategy, and timestamp.', 'lighthouse-scanner' ),
		'category'    => 'lighthouse-scanner',
		'output_schema' => array(
			'type'  => 'array',
			'items' => array( 'type' => 'object' ),
		),
		'permission_callback' => fn() => current_user_can( 'manage_options' ),
		'execute_callback'    => function( $input = null ) {
			$history = lhsc_get_history();
			return array_reverse( array_values( $history ) );
		},
		'meta' => array(
			'mcp'        => array( 'public' => true ),
			'annotations' => array( 'readonly' => true, 'destructive' => false, 'idempotent' => true ),
		),
	) );

	// --- Write abilities (gated by option) --------------------------------

	if ( ! get_option( 'lhsc_write_abilities', false ) ) {
		return;
	}

	wp_register_ability( 'lighthouse-scanner/run-scan', array(
		'label'       => __( 'Run Scan', 'lighthouse-scanner' ),
		'description' => __( 'Kick off a PageSpeed Insights scan of all configured URLs in the background. Returns immediately. Wait ~60 seconds then call get-history to retrieve results.', 'lighthouse-scanner' ),
		'category'    => 'lighthouse-scanner',
		'input_schema' => array(
			'type'       => 'object',
			'properties' => array(
				'strategy' => array(
					'type'    => 'string',
					'enum'    => array( 'mobile', 'desktop' ),
					'default' => 'mobile',
					'description' => 'Device strategy for the scan.',
				),
			),
		),
		'output_schema' => array(
			'type'       => 'object',
			'properties' => array(
				'started' => array( 'type' => 'boolean' ),
				'message' => array( 'type' => 'string' ),
				'strategy' => array( 'type' => 'string' ),
			),
		),
		'permission_callback' => fn() => current_user_can( 'manage_options' ),
		'execute_callback'    => function( $input = null ) {
			$strategy = ( isset( $input['strategy'] ) && $input['strategy'] === 'desktop' ) ? 'desktop' : 'mobile';

			// Schedule scan to run immediately via WP-Cron.
			wp_schedule_single_event( time() - 1, 'lhsc_ability_run_scan', array( $strategy ) );

			// Spawn cron now so it fires without waiting for the next page load.
			spawn_cron();

			return array(
				'started'  => true,
				'strategy' => $strategy,
				'message'  => __( 'Scan started in the background. Wait ~60 seconds then call get-history to retrieve results.', 'lighthouse-scanner' ),
			);
		},
		'meta' => array(
			'mcp'        => array( 'public' => true ),
			'annotations' => array( 'readonly' => false, 'destructive' => false, 'idempotent' => false ),
		),
	) );
}
