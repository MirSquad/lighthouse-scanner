<?php
/**
 * Plugin Name:       Lighthouse Scanner
 * Plugin URI:        https://miriamschwab.me/plugins/lighthouse-scanner
 * Description:       Run PageSpeed Insights scans across your site. Tracks history, alerts on regressions, and copies reports for AI-assisted fixes. Exposes a REST API (lighthouse-scanner/v1) for AI agent integration.
 * Version:           2.3.8
 * Author:            Miriam Schwab
 * Author URI:        https://miriamschwab.me
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       lighthouse-scanner
 * Domain Path:       /languages
 * Requires at least: 5.9
 * Requires PHP:      7.4
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action( 'init', function() {
	load_plugin_textdomain( 'lighthouse-scanner', false, dirname( plugin_basename( __FILE__ ) ) . '/languages' );
} );

define( 'LHSC_VERSION',       '2.3.8' );
define( 'LHSC_FILE',          __FILE__ );
define( 'LHSC_DIR',           plugin_dir_path( __FILE__ ) );
define( 'LHSC_URL',           plugin_dir_url( __FILE__ ) );
define( 'LHSC_OPT_KEY',       'lhsc_api_key' );
define( 'LHSC_OPT_THRESHOLD', 'lhsc_threshold' );
define( 'LHSC_OPT_SETUP',     'lhsc_setup_done' );
define( 'LHSC_OPT_HISTORY',   'lhsc_history' );

require_once LHSC_DIR . 'includes/abilities.php';

/* =============================================
   ADMIN MENU
   ============================================= */
add_action( 'admin_menu', function() {
	add_management_page(
		__( 'Lighthouse Scanner', 'lighthouse-scanner' ),
		__( 'Lighthouse Scanner', 'lighthouse-scanner' ),
		'manage_options',
		'lighthouse-scanner',
		'lhsc_render_page'
	);
} );

add_filter( 'plugin_action_links_' . plugin_basename( LHSC_FILE ), function( $links ) {
	$settings_link = '<a href="' . esc_url( admin_url( 'tools.php?page=lighthouse-scanner' ) ) . '">' . esc_html__( 'Settings', 'lighthouse-scanner' ) . '</a>';
	array_unshift( $links, $settings_link );
	return $links;
} );

/* =============================================
   ENQUEUE — admin page only
   ============================================= */
add_action( 'admin_enqueue_scripts', function( $hook ) {
	if ( 'tools_page_lighthouse-scanner' !== $hook ) return;

	$history     = lhsc_get_history();
	$prev_scores = lhsc_extract_prev_scores( $history );

	$scan_url = '';
	if ( ! empty( $_GET['lhsc_scan_url'] ) ) {
		$scan_url = esc_url_raw( wp_unslash( $_GET['lhsc_scan_url'] ) );
	}

	$data = [
		'urls'        => lhsc_get_site_urls(),
		'apiKey'      => lhsc_get_api_key(),
		'threshold'   => (int) get_option( LHSC_OPT_THRESHOLD, 85 ),
		'setupDone'   => (bool) get_option( LHSC_OPT_SETUP, false ),
		'history'     => $history,
		'prevScores'  => $prev_scores,
		'nonce'       => wp_create_nonce( 'lhsc_nonce' ),
		'ajaxUrl'     => admin_url( 'admin-ajax.php' ),
		'pluginPage'  => admin_url( 'tools.php?page=lighthouse-scanner' ),
		'autoRun'     => isset( $_GET['lhsc_autorun'] ) && get_option( LHSC_OPT_SETUP ),
		'scanThisUrl' => $scan_url,
	];

	// Inline CSS and JS directly into the page to bypass CDN caching of static assets
	add_action( 'admin_head', function() {
		echo '<style id="lhsc-admin-css">';
		readfile( LHSC_DIR . 'assets/admin.css' );
		echo '</style>';
	} );

	add_action( 'admin_footer', function() use ( $data ) {
		echo '<script id="lhsc-admin-js">';
		echo 'var lhscData=' . wp_json_encode( $data ) . ';';
		readfile( LHSC_DIR . 'assets/admin.js' );
		echo '</script>';
	} );
} );

/* =============================================
   ADMIN BAR MENU
   ============================================= */
add_action( 'admin_bar_menu', function( $bar ) {
	if ( ! current_user_can( 'manage_options' ) ) return;

	$plugin_url = esc_url( admin_url( 'tools.php?page=lighthouse-scanner' ) );

	$bar->add_node( [
		'id'    => 'lhsc-bar',
		'title' => '&#9889; Scan',
		'href'  => $plugin_url,
		'meta'  => [ 'class' => 'lhsc-adminbar-top' ],
	] );

	// Scan this page — plain href link to plugin page, no frontend JS needed
	if ( ! is_admin() ) {
		$current_url = ( is_ssl() ? 'https://' : 'http://' ) . sanitize_text_field( wp_unslash( $_SERVER['HTTP_HOST'] ) ) . strtok( wp_unslash( $_SERVER['REQUEST_URI'] ), '?' );
		$bar->add_node( [
			'parent' => 'lhsc-bar',
			'id'     => 'lhsc-bar-scan-page',
			'title'  => __( 'Scan this page', 'lighthouse-scanner' ),
			'href'   => esc_url( admin_url( 'tools.php?page=lighthouse-scanner&lhsc_scan_url=' . rawurlencode( $current_url ) ) ),
		] );
	}

	$bar->add_node( [
		'parent' => 'lhsc-bar',
		'id'     => 'lhsc-bar-goto',
		'title'  => __( 'Go to Lighthouse Scanner', 'lighthouse-scanner' ),
		'href'   => $plugin_url,
	] );
}, 100 );

/* =============================================
   SETTINGS
   ============================================= */
add_action( 'admin_init', function() {
	register_setting( 'lhsc_settings', LHSC_OPT_KEY, [
		'type'              => 'string',
		'sanitize_callback' => 'lhsc_sanitize_api_key',
		'default'           => '',
	] );
	register_setting( 'lhsc_settings', 'lhsc_write_abilities', [
		'sanitize_callback' => 'rest_sanitize_boolean',
	] );
	register_setting( 'lhsc_settings', LHSC_OPT_THRESHOLD, [
		'type'              => 'integer',
		'sanitize_callback' => 'absint',
		'default'           => 85,
	] );
} );

function lhsc_sanitize_api_key( $v ) {
	$v = sanitize_text_field( $v );
	return preg_match( '/^[A-Za-z0-9_\-]{0,100}$/', $v ) ? $v : '';
}

/* =============================================
   UPDATE DETECTION
   ============================================= */
add_action( 'upgrader_process_complete', function( $upgrader, $options ) {
	if ( ! in_array( $options['type'] ?? '', [ 'theme', 'plugin' ], true ) ) return;
	set_transient( 'lhsc_update_notice', $options['type'], 7 * DAY_IN_SECONDS );
}, 10, 2 );

add_action( 'admin_notices', function() {
	if ( ! current_user_can( 'manage_options' ) ) return;
	$type = get_transient( 'lhsc_update_notice' );
	if ( ! $type ) return;
	$scanner_url = esc_url( admin_url( 'tools.php?page=lighthouse-scanner&lhsc_autorun=1' ) );
	$nonce       = wp_create_nonce( 'lhsc_nonce' );
	$label       = $type === 'theme' ? __( 'theme', 'lighthouse-scanner' ) : __( 'plugin', 'lighthouse-scanner' );
	?>
	<div class="notice notice-info lhsc-update-notice" id="lhsc-update-notice" style="display:flex;align-items:center;gap:12px;padding:10px 16px;">
		<span>⚡ <strong><?php esc_html_e( 'Lighthouse Scanner:', 'lighthouse-scanner' ); ?></strong>
		<?php printf( esc_html__( 'A %s was just updated. Run a scan to check for regressions.', 'lighthouse-scanner' ), esc_html( $label ) ); ?></span>
		<a href="<?php echo esc_url( $scanner_url ); ?>" class="button button-small"><?php esc_html_e( 'Run scan now', 'lighthouse-scanner' ); ?></a>
		<a href="#" class="lhsc-dismiss-btn" data-nonce="<?php echo esc_attr( $nonce ); ?>" data-ajax="<?php echo esc_url( admin_url( 'admin-ajax.php' ) ); ?>" style="color:#999;text-decoration:none;font-size:20px;line-height:1;margin-left:4px;" title="Dismiss">&times;</a>
	</div>
	<script>
	(function(){
		var btn = document.querySelector('.lhsc-dismiss-btn');
		if (!btn) return;
		btn.addEventListener('click', function(e) {
			e.preventDefault();
			fetch(this.dataset.ajax, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:'action=lhsc_dismiss_notice&nonce='+this.dataset.nonce });
			document.getElementById('lhsc-update-notice')?.remove();
		});
	})();
	</script>
	<?php
} );

add_action( 'wp_ajax_lhsc_dismiss_notice', function() {
	check_ajax_referer( 'lhsc_nonce', 'nonce' );
	if ( ! current_user_can( 'manage_options' ) ) wp_die( -1 );
	delete_transient( 'lhsc_update_notice' );
	wp_send_json_success();
} );

/* =============================================
   AJAX: Complete setup
   ============================================= */
add_action( 'wp_ajax_lhsc_complete_setup', function() {
	check_ajax_referer( 'lhsc_nonce', 'nonce' );
	if ( ! current_user_can( 'manage_options' ) ) wp_die( -1 );
	$auto = ! empty( $_POST['auto'] );
	update_option( LHSC_OPT_SETUP, [ 'done' => true, 'auto' => $auto ], false );
	// Save API key if provided during setup
	if ( ! empty( $_POST['api_key'] ) ) {
		$key = lhsc_sanitize_api_key( wp_unslash( $_POST['api_key'] ) );
		if ( $key ) update_option( LHSC_OPT_KEY, $key, false );
	}
	wp_send_json_success();
} );

/* =============================================
   AJAX: Autocomplete post search
   ============================================= */
add_action( 'wp_ajax_lhsc_search_posts', function() {
	check_ajax_referer( 'lhsc_nonce', 'nonce' );
	if ( ! current_user_can( 'manage_options' ) ) wp_die( -1 );

	$term = sanitize_text_field( wp_unslash( $_POST['term'] ?? '' ) );
	if ( strlen( $term ) < 2 ) { wp_send_json_success( [] ); return; }

	$viewable_types = array_values( array_filter(
		get_post_types( [ 'public' => true ] ),
		'is_post_type_viewable'
	) );

	$query = new WP_Query( [
		'post_type'      => $viewable_types,
		'post_status'    => 'publish',
		's'              => $term,
		'posts_per_page' => 8,
		'no_found_rows'  => true,
	] );

	$results = [];
	foreach ( $query->posts as $post ) {
		$url = get_permalink( $post->ID );
		if ( $url ) {
			$pt_obj = get_post_type_object( $post->post_type );
			$results[] = [
				'title' => html_entity_decode( get_the_title( $post->ID ), ENT_QUOTES ),
				'url'   => esc_url( $url ),
				'type'  => $pt_obj ? $pt_obj->labels->singular_name : $post->post_type,
			];
		}
	}

	wp_send_json_success( $results );
} );

/* =============================================
   AJAX: Save scan history
   ============================================= */
add_action( 'wp_ajax_lhsc_save_history', function() {
	check_ajax_referer( 'lhsc_nonce', 'nonce' );
	if ( ! current_user_can( 'manage_options' ) ) wp_die( -1 );

	$raw  = wp_unslash( $_POST['scan'] ?? '' );
	$scan = json_decode( $raw, true );
	if ( ! is_array( $scan ) ) { wp_send_json_error( 'Invalid data' ); return; }

	$entry = [
		'id'        => sanitize_text_field( $scan['id'] ?? uniqid() ),
		'date'      => sanitize_text_field( $scan['date'] ?? current_time( 'M j, Y' ) ),
		'timestamp' => (int) ( $scan['timestamp'] ?? time() ),
		'strategy'  => in_array( $scan['strategy'] ?? '', [ 'mobile', 'desktop' ], true ) ? $scan['strategy'] : 'mobile',
		'results'   => [],
	];

	foreach ( (array) ( $scan['results'] ?? [] ) as $r ) {
		$entry['results'][] = [
			'url'    => esc_url_raw( $r['url'] ?? '' ),
			'label'  => sanitize_text_field( $r['label'] ?? '' ),
			'scores' => array_map( 'floatval', (array) ( $r['scores'] ?? [] ) ),
			'issues' => array_slice( array_map( function( $i ) {
				return [
					'category'     => sanitize_text_field( $i['category'] ?? '' ),
					'title'        => sanitize_text_field( $i['title'] ?? '' ),
					'description'  => sanitize_text_field( $i['description'] ?? '' ),
					'displayValue' => sanitize_text_field( $i['displayValue'] ?? '' ),
				];
			}, (array) ( $r['issues'] ?? [] ) ), 0, 20 ),
		];
	}

	$history = lhsc_get_history();
	array_unshift( $history, $entry );
	update_option( LHSC_OPT_HISTORY, array_slice( $history, 0, 20 ), false );

	wp_send_json_success();
} );

/* =============================================
   AJAX: Clear history
   ============================================= */
add_action( 'wp_ajax_lhsc_clear_history', function() {
	check_ajax_referer( 'lhsc_nonce', 'nonce' );
	if ( ! current_user_can( 'manage_options' ) ) wp_die( -1 );
	delete_option( LHSC_OPT_HISTORY );
	wp_send_json_success();
} );

/* =============================================
   HELPERS
   ============================================= */
function lhsc_get_api_key() {
	$k = get_option( LHSC_OPT_KEY, '' );
	return is_string( $k ) ? $k : '';
}

function lhsc_get_history() {
	$h = get_option( LHSC_OPT_HISTORY, [] );
	return is_array( $h ) ? $h : [];
}

function lhsc_extract_prev_scores( $history ) {
	if ( empty( $history ) ) return [];
	$prev = [];
	foreach ( ( $history[0]['results'] ?? [] ) as $r ) {
		if ( ! empty( $r['url'] ) ) $prev[ $r['url'] ] = $r['scores'] ?? [];
	}
	return $prev;
}

function lhsc_get_site_urls() {
	$urls     = [];
	$front_id = (int) get_option( 'page_on_front' );
	$posts_id = (int) get_option( 'page_for_posts' );

	// Homepage
	$urls[] = [ 'url' => esc_url( home_url('/') ), 'label' => 'Home' ];

	// Top-level pages (no parent), exclude front + posts page
	$pages = get_pages( [
		'post_status' => 'publish',
		'parent'      => 0,
		'sort_column' => 'menu_order',
		'exclude'     => array_filter( [ $front_id, $posts_id ] ),
	] );
	foreach ( $pages as $page ) {
		$urls[] = [
			'url'   => esc_url( get_permalink( $page->ID ) ),
			'label' => html_entity_decode( get_the_title( $page->ID ), ENT_QUOTES ),
		];
	}

	// Posts/writing page
	if ( $posts_id ) {
		$urls[] = [
			'url'   => esc_url( get_permalink( $posts_id ) ),
			'label' => html_entity_decode( get_the_title( $posts_id ), ENT_QUOTES ),
		];
	}

	// Latest blog post
	$posts = get_posts( [ 'numberposts' => 1, 'post_status' => 'publish', 'post_type' => 'post' ] );
	if ( $posts ) {
		$urls[] = [
			'url'   => esc_url( get_permalink( $posts[0]->ID ) ),
			'label' => 'Post: ' . html_entity_decode( get_the_title( $posts[0]->ID ), ENT_QUOTES ),
		];
	}

	// Latest from each publicly viewable CPT (exclude built-ins)
	$builtin = [
		// WordPress core
		'post', 'page', 'attachment', 'revision', 'nav_menu_item', 'custom_css',
		'customize_changeset', 'oembed_cache', 'user_request', 'wp_block',
		'wp_template', 'wp_template_part', 'wp_global_styles', 'wp_navigation',
		// Elementor internal
		'elementor_library', 'elementor_font', 'elementor_icons', 'elementor_snippet',
		'e-floating-buttons', 'elementor_component',
		// Other common plugin internals
		'acf-field-group', 'acf-field', 'oembed_cache', 'wp_global_styles',
	];

	$cpts = get_post_types( [ 'public' => true ], 'objects' );
	foreach ( $cpts as $cpt ) {
		if ( in_array( $cpt->name, $builtin, true ) ) continue;
		if ( ! is_post_type_viewable( $cpt->name ) ) continue;
		$latest = get_posts( [ 'numberposts' => 1, 'post_status' => 'publish', 'post_type' => $cpt->name ] );
		if ( $latest ) {
			$urls[] = [
				'url'   => esc_url( get_permalink( $latest[0]->ID ) ),
				'label' => $cpt->labels->singular_name . ': ' . html_entity_decode( get_the_title( $latest[0]->ID ), ENT_QUOTES ),
			];
		}
	}

	return $urls;
}

/* =============================================
   RENDER PAGE
   ============================================= */
function lhsc_render_page() {
	if ( ! current_user_can( 'manage_options' ) ) wp_die( esc_html__( 'Access denied.', 'lighthouse-scanner' ) );
	settings_errors( LHSC_OPT_KEY );
	$api_key   = lhsc_get_api_key();
	$threshold = (int) get_option( LHSC_OPT_THRESHOLD, 85 );
	$setup     = get_option( LHSC_OPT_SETUP, false );
	// Capture the scan URL from the admin-bar link for the "Scanning…" notice.
	$scan_url  = '';
	if ( ! empty( $_GET['lhsc_scan_url'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only URL passed from admin-bar "Scan this page" link. No state change.
		$scan_url = esc_url_raw( wp_unslash( $_GET['lhsc_scan_url'] ) );
	}
	?>
	<div class="wrap lhsc-wrap">
		<h1><?php esc_html_e( 'Lighthouse Scanner', 'lighthouse-scanner' ); ?></h1>

		<?php if ( ! $setup ) : ?>
		<div class="lhsc-card lhsc-setup-card" id="lhsc-setup-card">
			<h2><?php esc_html_e( 'Welcome to Lighthouse Scanner', 'lighthouse-scanner' ); ?></h2>

			<div id="lhsc-setup-step-1">
				<p><?php esc_html_e( 'How would you like to manage your URL list?', 'lighthouse-scanner' ); ?></p>
				<div class="lhsc-setup-options">
					<button class="lhsc-setup-btn lhsc-setup-btn--primary" id="lhsc-setup-auto">
						<strong><?php esc_html_e( 'Auto-populate from my site', 'lighthouse-scanner' ); ?></strong>
						<span><?php esc_html_e( 'Top-level pages, latest post, and public content types', 'lighthouse-scanner' ); ?></span>
					</button>
					<button class="lhsc-setup-btn" id="lhsc-setup-manual">
						<strong><?php esc_html_e( "I'll add URLs manually", 'lighthouse-scanner' ); ?></strong>
						<span><?php esc_html_e( 'Start with an empty list', 'lighthouse-scanner' ); ?></span>
					</button>
				</div>
			</div>

			<div id="lhsc-setup-step-2" style="display:none">
				<p><?php esc_html_e( 'Add a Google API key for faster, reliable scanning (optional but recommended).', 'lighthouse-scanner' ); ?></p>
				<div class="lhsc-setup-key-row">
					<input type="password" id="lhsc-setup-api-key" class="regular-text" placeholder="<?php esc_attr_e( 'Paste API key here', 'lighthouse-scanner' ); ?>" autocomplete="off" />
					<p class="lhsc-hint" style="margin-top:6px">
						<?php esc_html_e( 'Without a key: ~1 scan/minute. With a key: 25,000 scans/day.', 'lighthouse-scanner' ); ?>
						<a href="https://console.cloud.google.com/" target="_blank" rel="noopener"><?php esc_html_e( 'Get a key from Google Cloud Console →', 'lighthouse-scanner' ); ?></a>
					</p>
				</div>
				<div class="lhsc-setup-step2-btns">
					<button class="button button-primary" id="lhsc-setup-finish"><?php esc_html_e( 'Get started', 'lighthouse-scanner' ); ?></button>
					<button class="button" id="lhsc-setup-skip-key"><?php esc_html_e( 'Skip for now', 'lighthouse-scanner' ); ?></button>
				</div>
			</div>
		</div>
		<?php endif; ?>

		<div id="lhsc-main"<?php if ( ! $setup ) echo ' style="display:none"'; ?>>

			<!-- Settings -->
			<div class="lhsc-card lhsc-card--settings">
				<form method="post" action="options.php">
					<?php settings_fields( 'lhsc_settings' ); ?>
					<div class="lhsc-settings-row">
						<div class="lhsc-setting">
							<label class="lhsc-label" for="lhsc-api-key-input"><?php esc_html_e( 'Google API Key', 'lighthouse-scanner' ); ?></label>
							<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
								<input type="password" id="lhsc-api-key-input" name="<?php echo esc_attr( LHSC_OPT_KEY ); ?>" value="<?php echo esc_attr( $api_key ); ?>" class="regular-text" autocomplete="off" placeholder="<?php esc_attr_e( 'Paste key here', 'lighthouse-scanner' ); ?>" />
								<?php if ( $api_key ) echo '<span class="lhsc-key-saved">&#10003; ' . esc_html__( 'Saved', 'lighthouse-scanner' ) . '</span>'; ?>
							</div>
						</div>
						<div class="lhsc-setting">
							<label class="lhsc-label" for="lhsc-threshold-input"><?php esc_html_e( 'Alert below', 'lighthouse-scanner' ); ?></label>
							<div style="display:flex;align-items:center;gap:8px;">
								<input type="number" id="lhsc-threshold-input" name="<?php echo esc_attr( LHSC_OPT_THRESHOLD ); ?>" value="<?php echo esc_attr( $threshold ); ?>" min="0" max="100" style="width:64px" />
								<span class="lhsc-hint"><?php esc_html_e( 'Scores below this are flagged red', 'lighthouse-scanner' ); ?></span>
							</div>
						</div>
						<div class="lhsc-setting">
							<label class="lhsc-label"><?php esc_html_e( 'Abilities API', 'lighthouse-scanner' ); ?></label>
							<label>
								<input type="checkbox" name="lhsc_write_abilities" value="1" <?php checked( 1, get_option( 'lhsc_write_abilities', 0 ) ); ?> />
								<?php esc_html_e( 'Enable write abilities (run scans via AI agents)', 'lighthouse-scanner' ); ?>
							</label>
							<p class="lhsc-hint"><?php esc_html_e( 'Read access (settings, URLs, history) is always enabled. Requires WordPress 6.9+.', 'lighthouse-scanner' ); ?></p>
						</div>
						<?php submit_button( __( 'Save settings', 'lighthouse-scanner' ), 'secondary', 'submit', false ); ?>
					</div>
				</form>
			</div>

			<!-- Scanner -->
			<div class="lhsc-card">
				<p class="lhsc-intro"><?php esc_html_e( 'Run Google PageSpeed Insights on your pages. Copy results to Claude for theme fixes.', 'lighthouse-scanner' ); ?></p>
				<?php if ( ! empty( $scan_url ) ) : ?>
				<div class="notice notice-info inline" style="margin:0 0 12px;padding:8px 14px">
					<p style="margin:0">⚡ <?php printf( esc_html__( 'Scanning %s&hellip;', 'lighthouse-scanner' ), '<strong>' . esc_html( $scan_url ) . '</strong>' ); ?></p>
				</div>
				<?php endif; ?>
				<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid #f0f0f1">
					<label for="lhsc-strategy" style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#1d2327;margin:0;white-space:nowrap"><?php esc_html_e( 'Device', 'lighthouse-scanner' ); ?></label>
					<select id="lhsc-strategy" style="height:30px;font-size:13px;width:auto;min-width:90px;max-width:130px;flex-shrink:0">
						<option value="mobile"><?php esc_html_e( 'Mobile', 'lighthouse-scanner' ); ?></option>
						<option value="desktop"><?php esc_html_e( 'Desktop', 'lighthouse-scanner' ); ?></option>
					</select>
					<button type="button" class="button button-primary" id="lhsc-run"><?php esc_html_e( 'Run scans', 'lighthouse-scanner' ); ?></button>
					<button type="button" class="button" id="lhsc-copy" style="display:none"><?php esc_html_e( 'Copy report for Claude', 'lighthouse-scanner' ); ?></button>
					<button type="button" class="button" id="lhsc-csv" style="display:none"><?php esc_html_e( 'Export CSV', 'lighthouse-scanner' ); ?></button>
					<p id="lhsc-copied" style="display:none;color:#00a32a;font-size:12px;margin:0"><?php esc_html_e( 'Copied!', 'lighthouse-scanner' ); ?></p>
				</div>

				<label class="lhsc-label lhsc-urls-label"><?php esc_html_e( 'Pages to scan', 'lighthouse-scanner' ); ?></label>
				<div class="lhsc-search-wrap">
					<input type="text" id="lhsc-search" class="lhsc-search-input" placeholder="<?php esc_attr_e( 'Search pages & posts to add...', 'lighthouse-scanner' ); ?>" autocomplete="off" />
					<div id="lhsc-search-results" class="lhsc-search-results" style="display:none"></div>
				</div>
				<div id="lhsc-url-list" class="lhsc-url-list"><?php esc_html_e( 'Loading...', 'lighthouse-scanner' ); ?></div>

				<div id="lhsc-progress" class="lhsc-progress" style="display:none"></div>
				<div id="lhsc-results" class="lhsc-results"></div>
			</div>

			<!-- History -->
			<div class="lhsc-card lhsc-history-card" id="lhsc-history-card" style="display:none">
				<div class="lhsc-history-header">
					<h2 class="lhsc-section-title"><?php esc_html_e( 'Scan History', 'lighthouse-scanner' ); ?></h2>
					<button type="button" class="button" id="lhsc-clear-history"><?php esc_html_e( 'Clear history', 'lighthouse-scanner' ); ?></button>
				</div>
				<div id="lhsc-graph" class="lhsc-graph"></div>
				<div id="lhsc-history-list" class="lhsc-history-list"></div>
			</div>

		</div><!-- #lhsc-main -->
	</div>
	<?php
}

/* =============================================
   REST API
   Exposes plugin capabilities for AI agents and
   external tools. All endpoints require the
   manage_options capability (site admins only).

   Namespace: lighthouse-scanner/v1

   GET  /urls          — list all tracked URLs
   GET  /history       — scan history with scores and issues
   GET  /history/{id}  — single scan entry by ID
   POST /scan          — trigger a PageSpeed scan
   DELETE /history     — clear all history

   Authentication: WordPress application passwords
   (Dashboard → Users → Edit → Application Passwords).
   Compatible with WordPress MCP when available.
   ============================================= */
add_action( 'rest_api_init', function() {

	$ns = 'lighthouse-scanner/v1';

	/* ------------------------------------------
	   Permission callback — all endpoints share this.
	   Requires manage_options (admins only).
	   ------------------------------------------ */
	$auth = function() {
		return current_user_can( 'manage_options' )
			? true
			: new WP_Error(
				'rest_forbidden',
				__( 'You do not have permission to access Lighthouse Scanner data.', 'lighthouse-scanner' ),
				[ 'status' => 403 ]
			);
	};

	/* ------------------------------------------
	   GET /urls
	   Returns the same URL list the admin UI uses.
	   Useful for an AI agent to discover which
	   pages exist before requesting a scan.

	   Response:
	   [
	     { "url": "https://example.com/", "label": "Home" },
	     { "url": "https://example.com/about/", "label": "About" },
	     ...
	   ]
	   ------------------------------------------ */
	register_rest_route( $ns, '/urls', [
		'methods'             => 'GET',
		'callback'            => function() {
			return rest_ensure_response( lhsc_get_site_urls() );
		},
		'permission_callback' => $auth,
	] );

	/* ------------------------------------------
	   GET /history
	   Returns up to 20 most recent scan entries.
	   Optional query params:
	     ?limit=5          — max entries to return (1–20)
	     ?strategy=mobile  — filter by strategy
	     ?url=https://...  — filter results to one URL

	   Response:
	   [
	     {
	       "id": "abc123",
	       "date": "Mar 22, 2026",
	       "timestamp": 1742600000,
	       "strategy": "mobile",
	       "results": [
	         {
	           "url": "https://example.com/",
	           "label": "Home",
	           "scores": {
	             "performance": 91,
	             "accessibility": 100,
	             "best-practices": 100,
	             "seo": 100
	           },
	           "issues": [
	             {
	               "category": "Performance",
	               "title": "Reduce unused JavaScript",
	               "description": "...",
	               "displayValue": "Est savings of 61 KiB"
	             }
	           ]
	         }
	       ]
	     }
	   ]
	   ------------------------------------------ */
	register_rest_route( $ns, '/history', [
		'methods'             => 'GET',
		'callback'            => function( WP_REST_Request $req ) {
			$history  = lhsc_get_history();
			$limit    = min( 20, max( 1, (int) ( $req->get_param( 'limit' ) ?? 20 ) ) );
			$strategy = sanitize_text_field( $req->get_param( 'strategy' ) ?? '' );
			$url      = esc_url_raw( $req->get_param( 'url' ) ?? '' );

			// Filter by strategy if provided
			if ( $strategy ) {
				$history = array_values( array_filter( $history, function( $e ) use ( $strategy ) { return $e['strategy'] === $strategy; } ) );
			}

			$history = array_slice( $history, 0, $limit );

			// Filter results to one URL if requested
			if ( $url ) {
				foreach ( $history as &$entry ) {
					$entry['results'] = array_values(
						array_filter( $entry['results'], function( $r ) use ( $url ) { return $r['url'] === $url; } )
					);
				}
				unset( $entry );
			}

			return rest_ensure_response( $history );
		},
		'permission_callback' => $auth,
		'args'                => [
			'limit'    => [ 'type' => 'integer', 'minimum' => 1, 'maximum' => 20 ],
			'strategy' => [ 'type' => 'string',  'enum' => [ 'mobile', 'desktop' ] ],
			'url'      => [ 'type' => 'string',  'format' => 'uri' ],
		],
	] );

	/* ------------------------------------------
	   GET /history/{id}
	   Returns a single scan entry by its ID.
	   Useful for an AI agent to retrieve a
	   specific scan it triggered via POST /scan.
	   ------------------------------------------ */
	register_rest_route( $ns, '/history/(?P<id>[a-zA-Z0-9_\-]+)', [
		'methods'             => 'GET',
		'callback'            => function( WP_REST_Request $req ) {
			$id      = sanitize_text_field( $req->get_param( 'id' ) );
			$history = lhsc_get_history();
			foreach ( $history as $entry ) {
				if ( ( $entry['id'] ?? '' ) === $id ) {
					return rest_ensure_response( $entry );
				}
			}
			return new WP_Error( 'not_found', 'Scan not found.', [ 'status' => 404 ] );
		},
		'permission_callback' => $auth,
	] );

	/* ------------------------------------------
	   POST /scan
	   Triggers a PageSpeed Insights scan and
	   stores the results in history.

	   The actual PageSpeed API call happens in the
	   browser (JS) in the admin UI, because the
	   Google API key is only exposed client-side.
	   This endpoint instead accepts completed scan
	   results and saves them — matching the same
	   flow as lhsc_save_history AJAX handler.

	   If called with just { "trigger": true }, it
	   returns the list of URLs and API key hint so
	   an AI agent or automation tool can perform
	   the scan itself and POST the results back.

	   Request body (application/json):
	   {
	     "trigger": true
	   }
	   — or —
	   {
	     "id": "abc123",
	     "date": "Mar 22, 2026",
	     "timestamp": 1742600000,
	     "strategy": "mobile",
	     "results": [ ... ]
	   }

	   Response (trigger mode):
	   {
	     "action": "scan_required",
	     "urls": [ ... ],
	     "api_key_configured": true,
	     "strategy": "mobile",
	     "message": "Perform PageSpeed scans on the provided URLs..."
	   }

	   Response (save mode):
	   {
	     "id": "abc123",
	     "saved": true,
	     "results_count": 7
	   }
	   ------------------------------------------ */
	register_rest_route( $ns, '/scan', [
		'methods'             => 'POST',
		'callback'            => function( WP_REST_Request $req ) {
			$body = $req->get_json_params();

			// Trigger mode — return URLs and config so caller can run the scan
			if ( ! empty( $body['trigger'] ) ) {
				return rest_ensure_response( [
					'action'           => 'scan_required',
					'urls'             => lhsc_get_site_urls(),
					'api_key_configured' => ! empty( lhsc_get_api_key() ),
					'strategy'         => 'mobile',
					'pagespeed_api'    => 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed',
					'message'          => 'Perform PageSpeed Insights scans on each URL using the API, then POST the results back to this endpoint in the standard scan format.',
				] );
			}

			// Save mode — accept and store completed scan results
			if ( empty( $body['results'] ) || ! is_array( $body['results'] ) ) {
				return new WP_Error( 'invalid_data', 'Missing results array.', [ 'status' => 400 ] );
			}

			$entry = [
				'id'        => sanitize_text_field( $body['id'] ?? uniqid( 'rest_' ) ),
				'date'      => sanitize_text_field( $body['date'] ?? current_time( 'M j, Y' ) ),
				'timestamp' => (int) ( $body['timestamp'] ?? time() ),
				'strategy'  => in_array( $body['strategy'] ?? '', [ 'mobile', 'desktop' ], true )
					? $body['strategy'] : 'mobile',
				'results'   => [],
			];

			foreach ( (array) $body['results'] as $r ) {
				$entry['results'][] = [
					'url'    => esc_url_raw( $r['url'] ?? '' ),
					'label'  => sanitize_text_field( $r['label'] ?? '' ),
					'scores' => array_map( 'floatval', (array) ( $r['scores'] ?? [] ) ),
					'issues' => array_slice( array_map( function( $i ) {
						return [
							'category'     => sanitize_text_field( $i['category'] ?? '' ),
							'title'        => sanitize_text_field( $i['title'] ?? '' ),
							'description'  => sanitize_text_field( $i['description'] ?? '' ),
							'displayValue' => sanitize_text_field( $i['displayValue'] ?? '' ),
						];
					}, (array) ( $r['issues'] ?? [] ) ), 0, 20 ),
				];
			}

			$history = lhsc_get_history();
			array_unshift( $history, $entry );
			update_option( LHSC_OPT_HISTORY, array_slice( $history, 0, 20 ), false );

			return rest_ensure_response( [
				'id'            => $entry['id'],
				'saved'         => true,
				'results_count' => count( $entry['results'] ),
			] );
		},
		'permission_callback' => $auth,
	] );

	/* ------------------------------------------
	   DELETE /history
	   Clears all stored scan history.
	   ------------------------------------------ */
	register_rest_route( $ns, '/history', [
		'methods'             => 'DELETE',
		'callback'            => function() {
			delete_option( LHSC_OPT_HISTORY );
			return rest_ensure_response( [ 'cleared' => true ] );
		},
		'permission_callback' => $auth,
	] );

} );

/* =============================================
   ANGIE MCP SERVER
   Enqueues the compiled Angie MCP server JS on
   admin pages where Angie is active.

   The JS at angie/dist/mcp-server.js registers
   three tools with Angie:
     - get-lighthouse-urls
     - get-lighthouse-history
     - run-lighthouse-scan

   BUILD INSTRUCTIONS (one-time, needs Node.js):
     cd wp-content/plugins/lighthouse-scanner/angie
     npm install
     npm run build
   This produces angie/dist/mcp-server.js which
   WordPress loads automatically on admin pages.
   ============================================= */
add_action( 'admin_enqueue_scripts', function() {
    $dist = plugin_dir_path( __FILE__ ) . 'angie/dist/mcp-server.js';

    // Only load if built file exists
    if ( ! file_exists( $dist ) ) return;

    // Only load if Elementor is active (Angie lives inside Elementor)
    if ( ! defined( 'ELEMENTOR_VERSION' ) && ! class_exists( 'Elementor\\Plugin' ) ) return;

    wp_enqueue_script(
        'lhsc-angie-mcp',
        plugin_dir_url( __FILE__ ) . 'angie/dist/mcp-server.js',
        [],
        LHSC_VERSION,
        true
    );

    // Pass REST URL, nonce, API key, and version to the JS
    wp_localize_script( 'lhsc-angie-mcp', 'lhscAngie', [
        'restUrl' => esc_url_raw( rest_url() ),
        'nonce'   => wp_create_nonce( 'wp_rest' ),
        'apiKey'  => lhsc_get_api_key(),
        'version' => LHSC_VERSION,
    ] );
} );
