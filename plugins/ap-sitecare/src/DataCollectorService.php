<?php

namespace APSiteCare;

defined('ABSPATH') || exit;

final class DataCollectorService
{
    public function __construct(private SettingsRepository $settings)
    {
    }

    public function collect(): array
    {
        if (!function_exists('get_plugin_updates')) {
            require_once ABSPATH . 'wp-admin/includes/update.php';
        }

        return array(
            'wordpressVersion' => get_bloginfo('version'),
            'phpVersion' => PHP_VERSION,
            'pluginUpdateCount' => count(get_plugin_updates()),
            'themeUpdateCount' => count(get_theme_updates()),
            'lastCronRunAt' => $this->settings->get_last_cron_run_at(),
        );
    }
}
