<?php

namespace APSiteCare;

defined('ABSPATH') || exit;

final class SettingsRepository
{
    private const OPTION_KEY = 'apsc_settings';
    private const LAST_CRON_KEY = 'apsc_last_cron_run_at';

    public function get_all(): array
    {
        $settings = get_option(self::OPTION_KEY, array());

        return array(
            'dashboard_url' => isset($settings['dashboard_url']) ? (string) $settings['dashboard_url'] : '',
            'site_id' => isset($settings['site_id']) ? (string) $settings['site_id'] : '',
            'site_secret' => isset($settings['site_secret']) ? (string) $settings['site_secret'] : '',
            'enable_client_view' => $this->boolean_setting($settings, 'enable_client_view', true),
            'enable_dashboard_widget' => $this->boolean_setting($settings, 'enable_dashboard_widget', true),
            'plan_label' => isset($settings['plan_label']) ? (string) $settings['plan_label'] : '',
            'show_security' => $this->boolean_setting($settings, 'show_security', true),
            'show_backups' => $this->boolean_setting($settings, 'show_backups', true),
            'show_updates' => $this->boolean_setting($settings, 'show_updates', true),
            'show_uptime' => $this->boolean_setting($settings, 'show_uptime', true),
            'show_service_time' => $this->boolean_setting($settings, 'show_service_time', true),
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
            'enable_client_view' => isset($input['enable_client_view']),
            'enable_dashboard_widget' => isset($input['enable_dashboard_widget']),
            'plan_label' => sanitize_text_field($input['plan_label'] ?? ''),
            'show_security' => isset($input['show_security']),
            'show_backups' => isset($input['show_backups']),
            'show_updates' => isset($input['show_updates']),
            'show_uptime' => isset($input['show_uptime']),
            'show_service_time' => isset($input['show_service_time']),
        ), false);
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
}
