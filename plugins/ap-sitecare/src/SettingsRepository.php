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
        );
    }

    public function save(array $input): void
    {
        update_option(self::OPTION_KEY, array(
            'dashboard_url' => untrailingslashit(esc_url_raw($input['dashboard_url'] ?? '')),
            'site_id' => sanitize_text_field($input['site_id'] ?? ''),
            'site_secret' => sanitize_text_field($input['site_secret'] ?? ''),
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
}
