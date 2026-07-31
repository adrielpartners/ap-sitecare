<?php

namespace APSiteCare;

defined('ABSPATH') || exit;

final class CronController
{
    public const HOOK = 'apsc_scheduled_check_in';

    public function __construct(
        private SettingsRepository $settings,
        private ReporterService $reporter,
        private ClientCareService $client_care
    )
    {
    }

    public function register_hooks(): void
    {
        add_filter('cron_schedules', array($this, 'add_six_hour_schedule'));
        add_action('init', array($this, 'ensure_schedule'));
        add_action(self::HOOK, array($this, 'run'));
    }

    public function add_six_hour_schedule(array $schedules): array
    {
        $schedules['apsc_six_hours'] = array(
            'interval' => 6 * HOUR_IN_SECONDS,
            'display' => __('Every six hours (AP SiteCare)', 'ap-sitecare'),
        );
        return $schedules;
    }

    public function run(): void
    {
        $this->settings->record_cron_run();
        try {
            $this->reporter->check_in();
        } catch (\Throwable $error) {
            do_action('apsc_check_in_failed', $error);
            return;
        }

        try {
            $this->client_care->refresh_remote_summary();
        } catch (\Throwable $error) {
            do_action('apsc_client_summary_refresh_failed', $error);
        }
    }

    public function ensure_schedule(): void
    {
        $schedule = wp_get_schedule(self::HOOK);
        if ($schedule === 'apsc_six_hours') {
            return;
        }
        wp_clear_scheduled_hook(self::HOOK);
        wp_schedule_event(time() + MINUTE_IN_SECONDS, 'apsc_six_hours', self::HOOK);
    }

    public static function activate(): void
    {
        if (!wp_next_scheduled(self::HOOK)) {
            wp_schedule_event(time() + MINUTE_IN_SECONDS, 'apsc_six_hours', self::HOOK);
        }
    }

    public static function deactivate(): void
    {
        wp_clear_scheduled_hook(self::HOOK);
    }
}
