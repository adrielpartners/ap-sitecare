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

        $core_updates = get_core_updates(array('dismissed' => false));
        $core_update_available = false;
        foreach ($core_updates as $core_update) {
            if (isset($core_update->response) && $core_update->response === 'upgrade') {
                $core_update_available = true;
                break;
            }
        }

        $update_core = get_site_transient('update_core');
        $active_theme = wp_get_theme();

        return array(
            'wordpressVersion' => get_bloginfo('version'),
            'phpVersion' => PHP_VERSION,
            'pluginUpdateCount' => count(get_plugin_updates()),
            'themeUpdateCount' => count(get_theme_updates()),
            'lastCronRunAt' => $this->settings->get_last_cron_run_at(),
            'coreUpdateAvailable' => $core_update_available,
            'lastUpdateCheckAt' => is_object($update_core) && isset($update_core->last_checked)
                ? gmdate('c', (int) $update_core->last_checked)
                : null,
            'activeTheme' => $active_theme->exists() ? $active_theme->get('Name') : null,
        );
    }
}
