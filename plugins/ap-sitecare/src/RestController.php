<?php

namespace APSiteCare;

defined('ABSPATH') || exit;

final class RestController
{
    public function __construct(
        private SettingsRepository $settings,
        private ReporterService $reporter,
        private PluginUpdateService $plugin_updates
    ) {
    }

    public function register_hooks(): void
    {
        add_action('rest_api_init', array($this, 'register_routes'));
    }

    public function register_routes(): void
    {
        register_rest_route('ap-sitecare/v1', '/refresh', array(
            'methods' => 'POST',
            'callback' => array($this, 'refresh'),
            'permission_callback' => '__return_true',
        ));
        register_rest_route('ap-sitecare/v1', '/plugin-update', array(
            'methods' => 'POST',
            'callback' => array($this, 'plugin_update'),
            'permission_callback' => '__return_true',
        ));
    }

    public function refresh(\WP_REST_Request $request)
    {
        $authenticated = $this->authenticate($request, 'refresh');
        if (is_wp_error($authenticated)) {
            return $authenticated;
        }
        $payload = $authenticated;
        try {
            $this->reporter->check_in();
        } catch (\Throwable $error) {
            return new \WP_Error('apsc_refresh_failed', sanitize_text_field($error->getMessage()), array('status' => 502));
        }
        return rest_ensure_response(array('ok' => true, 'reportedAt' => gmdate('c')));
    }

    public function plugin_update(\WP_REST_Request $request)
    {
        $payload = $this->authenticate($request, 'plugin-update');
        if (is_wp_error($payload)) {
            return $payload;
        }
        $settings = $this->settings->get_all();
        $dashboard_host = wp_parse_url($settings['dashboard_url'], PHP_URL_HOST);
        $package_host = wp_parse_url((string) ($payload['packageUrl'] ?? ''), PHP_URL_HOST);
        $dashboard_scheme = wp_parse_url($settings['dashboard_url'], PHP_URL_SCHEME);
        $package_scheme = wp_parse_url((string) ($payload['packageUrl'] ?? ''), PHP_URL_SCHEME);
        $dashboard_port = wp_parse_url($settings['dashboard_url'], PHP_URL_PORT);
        $package_port = wp_parse_url((string) ($payload['packageUrl'] ?? ''), PHP_URL_PORT);
        $package_path = wp_parse_url((string) ($payload['packageUrl'] ?? ''), PHP_URL_PATH);
        if (!$dashboard_host || !$package_host
            || !hash_equals(strtolower((string) $dashboard_host), strtolower((string) $package_host))
            || !hash_equals(strtolower((string) $dashboard_scheme), strtolower((string) $package_scheme))
            || !hash_equals((string) $dashboard_port, (string) $package_port)
            || !is_string($package_path) || strpos($package_path, '/api/plugin/package-download/') !== 0) {
            return new \WP_Error('apsc_package_origin', 'The plugin package does not use the configured Dashboard origin.', array('status' => 400));
        }
        $result = $this->plugin_updates->execute($payload);
        if (is_wp_error($result)) {
            return new \WP_Error(
                sanitize_key((string) $result->get_error_code()),
                sanitize_text_field($result->get_error_message()),
                array('status' => 409)
            );
        }
        try {
            $this->reporter->check_in();
        } catch (\Throwable $error) {
            // The verified update result is still returned; the dashboard will schedule a normal refresh.
        }
        return rest_ensure_response(array_merge(array('ok' => true), $result));
    }

    private function authenticate(\WP_REST_Request $request, string $expected_action)
    {
        $settings = $this->settings->get_all();
        $site_id = sanitize_text_field((string) $request->get_header('x-apsc-site-id'));
        $timestamp = sanitize_text_field((string) $request->get_header('x-apsc-timestamp'));
        $signature = sanitize_text_field((string) $request->get_header('x-apsc-dashboard-signature'));
        $timestamp_value = strtotime($timestamp);
        if ($site_id === '' || $timestamp_value === false || abs(time() - $timestamp_value) > 5 * MINUTE_IN_SECONDS) {
            return new \WP_Error('apsc_unauthorized', 'The signed dashboard request is invalid or stale.', array('status' => 401));
        }
        if (!hash_equals($settings['site_id'], $site_id)) {
            return new \WP_Error('apsc_unauthorized', 'The signed dashboard request is invalid.', array('status' => 401));
        }

        $raw_body = $request->get_body();
        $message = 'dashboard-to-plugin.' . $timestamp . '.' . $raw_body;
        $valid = $this->signature_matches($settings['site_secret'], $message, $signature);
        $previous_is_valid = $settings['previous_site_secret'] !== ''
            && strtotime($settings['previous_site_secret_valid_until']) > time();
        if (!$valid && $previous_is_valid) {
            $valid = $this->signature_matches($settings['previous_site_secret'], $message, $signature);
        }
        if (!$valid) {
            return new \WP_Error('apsc_unauthorized', 'The signed dashboard request is invalid.', array('status' => 401));
        }

        $payload = json_decode($raw_body, true);
        if (!is_array($payload) || ($payload['action'] ?? '') !== $expected_action) {
            return new \WP_Error('apsc_bad_request', 'The signed dashboard request is invalid.', array('status' => 400));
        }
        $request_id = isset($payload['requestId']) ? sanitize_text_field((string) $payload['requestId']) : '';
        if (!$this->settings->claim_dashboard_request($request_id)) {
            return new \WP_Error('apsc_replay', 'The dashboard request was already used.', array('status' => 409));
        }
        return $payload;
    }

    private function signature_matches(string $secret, string $message, string $signature): bool
    {
        if ($secret === '' || $signature === '') {
            return false;
        }
        return hash_equals(hash_hmac('sha256', $message, $secret), strtolower($signature));
    }
}
