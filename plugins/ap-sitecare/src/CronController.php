<?php

namespace APSiteCare;

defined('ABSPATH') || exit;

final class CronController
{
    public const HOOK = 'apsc_scheduled_check_in';

    public function __construct(private SettingsRepository $settings, private ReporterService $reporter)
    {
    }

    public function register_hooks(): void
    {
        add_action(self::HOOK, array($this, 'run'));
    }

    public function run(): void
    {
        $this->settings->record_cron_run();
        try {
            $this->reporter->check_in();
        } catch (\Throwable $error) {
            do_action('apsc_check_in_failed', $error);
        }
    }

    public static function activate(): void
    {
        if (!wp_next_scheduled(self::HOOK)) {
            wp_schedule_event(time() + MINUTE_IN_SECONDS, 'hourly', self::HOOK);
        }
    }

    public static function deactivate(): void
    {
        wp_clear_scheduled_hook(self::HOOK);
    }
}
