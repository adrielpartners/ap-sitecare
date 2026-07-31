<?php

namespace APSiteCare;

defined('ABSPATH') || exit;

final class SettingsRepository
{
    private const OPTION_KEY = 'apsc_settings';
    private const LAST_CRON_KEY = 'apsc_last_cron_run_at';
    private const DASHBOARD_REQUESTS_KEY = 'apsc_dashboard_request_ids';

    public function get_all(): array
    {
        $settings = get_option(self::OPTION_KEY, array());

        return array(
            'dashboard_url' => isset($settings['dashboard_url']) ? (string) $settings['dashboard_url'] : '',
            'site_id' => isset($settings['site_id']) ? (string) $settings['site_id'] : '',
            'site_secret' => isset($settings['site_secret']) ? (string) $settings['site_secret'] : '',
            'previous_site_secret' => isset($settings['previous_site_secret']) ? (string) $settings['previous_site_secret'] : '',
            'previous_site_secret_valid_until' => isset($settings['previous_site_secret_valid_until']) ? (string) $settings['previous_site_secret_valid_until'] : '',
            'credential_id' => isset($settings['credential_id']) ? (string) $settings['credential_id'] : '',
            'enable_client_view' => $this->boolean_setting($settings, 'enable_client_view', true),
            'enable_dashboard_widget' => $this->boolean_setting($settings, 'enable_dashboard_widget', true),
            'plan_label' => isset($settings['plan_label']) ? (string) $settings['plan_label'] : '',
            'show_security' => $this->boolean_setting($settings, 'show_security', true),
            'show_backups' => $this->boolean_setting($settings, 'show_backups', true),
            'show_updates' => $this->boolean_setting($settings, 'show_updates', true),
            'show_uptime' => $this->boolean_setting($settings, 'show_uptime', true),
        );
    }

    public function save(array $input): void
    {
        $current = $this->get_all();
        $secret = sanitize_text_field($input['site_secret'] ?? '');

        update_option(self::OPTION_KEY, array(
            'dashboard_url' => untrailingslashit(esc_url_raw($input['dashboard_url'] ?? '')),
            'site_id' => sanitize_text_field($input['site_id'] ?? ''),
            'site_secret' => $secret !== '' ? $secret : $current['site_secret'],
            'previous_site_secret' => $secret !== '' ? '' : $current['previous_site_secret'],
            'previous_site_secret_valid_until' => $secret !== '' ? '' : $current['previous_site_secret_valid_until'],
            'credential_id' => $secret !== '' ? '' : $current['credential_id'],
            'enable_client_view' => isset($input['enable_client_view']),
            'enable_dashboard_widget' => isset($input['enable_dashboard_widget']),
            'plan_label' => sanitize_text_field($input['plan_label'] ?? ''),
            'show_security' => isset($input['show_security']),
            'show_backups' => isset($input['show_backups']),
            'show_updates' => isset($input['show_updates']),
            'show_uptime' => isset($input['show_uptime']),
        ), false);
    }

    public function apply_rotation(array $rotation): bool
    {
        $secret = isset($rotation['secret']) ? sanitize_text_field($rotation['secret']) : '';
        $credential_id = isset($rotation['credentialId']) ? sanitize_text_field($rotation['credentialId']) : '';
        if ($secret === '' || $credential_id === '') {
            return false;
        }

        $settings = $this->get_all();
        if ($settings['credential_id'] === $credential_id && hash_equals($settings['site_secret'], $secret)) {
            return true;
        }

        $settings['previous_site_secret'] = $settings['site_secret'];
        $settings['previous_site_secret_valid_until'] = gmdate('c', time() + 14 * DAY_IN_SECONDS);
        $settings['site_secret'] = $secret;
        $settings['credential_id'] = $credential_id;
        $this->store($settings);
        return true;
    }

    public function acknowledge_update_activities(array $activity_ids): void
    {
        do_action('apsc_update_activities_acknowledged', array_values(array_filter(array_map('sanitize_text_field', $activity_ids))));
    }

    public function claim_dashboard_request(string $request_id): bool
    {
        $request_id = sanitize_text_field($request_id);
        if ($request_id === '') {
            return false;
        }
        $requests = get_option(self::DASHBOARD_REQUESTS_KEY, array());
        $requests = is_array($requests) ? $requests : array();
        $cutoff = time() - 10 * MINUTE_IN_SECONDS;
        $requests = array_filter($requests, static fn ($timestamp) => is_int($timestamp) && $timestamp >= $cutoff);
        if (isset($requests[$request_id])) {
            return false;
        }
        $requests[$request_id] = time();
        if (count($requests) > 100) {
            asort($requests);
            $requests = array_slice($requests, -100, null, true);
        }
        update_option(self::DASHBOARD_REQUESTS_KEY, $requests, false);
        return true;
    }

    public function get_last_cron_run_at(): ?string
    {
        $value = get_option(self::LAST_CRON_KEY);
        return is_string($value) && $value !== '' ? $value : null;
    }

    public function record_cron_run(): string
    {
        $timestamp = gmdate('c');
        update_option(self::LAST_CRON_KEY, $timestamp, false);
        return $timestamp;
    }

    private function boolean_setting(array $settings, string $key, bool $default): bool
    {
        return array_key_exists($key, $settings) ? (bool) $settings[$key] : $default;
    }

    private function store(array $settings): void
    {
        unset($settings['show_service_time']);
        update_option(self::OPTION_KEY, $settings, false);
    }
}
