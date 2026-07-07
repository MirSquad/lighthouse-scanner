<?php
/**
 * Uninstall routine for Lighthouse Scanner.
 *
 * Removes all plugin data from the database when the plugin is deleted
 * via Plugins > Delete in wp-admin. Does NOT run on deactivation.
 *
 * Data removed:
 *   lhsc_api_key      — Google PageSpeed API key
 *   lhsc_threshold    — Score alert threshold
 *   lhsc_setup_done   — First-run setup flag
 *   lhsc_history      — Scan history (up to 20 entries)
 *   lhsc_score_scale_fixed_v2 — Migration flag for the 0-100/0-1 score scale fix
 *   lhsc_update_notice — Transient for regression alert notice
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

delete_option( 'lhsc_api_key' );
delete_option( 'lhsc_threshold' );
delete_option( 'lhsc_setup_done' );
delete_option( 'lhsc_history' );
delete_option( 'lhsc_write_abilities' );
delete_option( 'lhsc_score_scale_fixed_v2' );
delete_transient( 'lhsc_update_notice' );
