<?php

namespace APSiteCare;

defined('ABSPATH') || exit;

final class RestController
{
    public function __construct(
        private SettingsRepository $settings,
        private ReporterService $reporter
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
    }

    public function refresh(\WP_REST_Request $request)
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
        if (!is_array($payload) || ($payload['action'] ?? '') !== 'refresh') {
            return new \WP_Error('apsc_bad_request', 'The refresh request is invalid.', array('status' => 400));
        }
        $request_id = isset($payload['requestId']) ? sanitize_text_field((string) $payload['requestId']) : '';
        if (!$this->settings->claim_dashboard_request($request_id)) {
            return new \WP_Error('apsc_replay', 'The refresh request was already used.', array('status' => 409));
        }

        try {
            $this->reporter->check_in();
        } catch (\Throwable $error) {
            return new \WP_Error('apsc_refresh_failed', sanitize_text_field($error->getMessage()), array('status' => 502));
        }
        return rest_ensure_response(array('ok' => true, 'reportedAt' => gmdate('c')));
    }

    private function signature_matches(string $secret, string $message, string $signature): bool
    {
        if ($secret === '' || $signature === '') {
            return false;
        }
        return hash_equals(hash_hmac('sha256', $message, $secret), strtolower($signature));
    }
}
