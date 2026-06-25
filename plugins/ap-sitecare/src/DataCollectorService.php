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
            'backupSource' => $this->collect_backup_source(),
        );
    }

    private function collect_backup_source(): array
    {
        $database_host = defined('DB_HOST') ? (string) DB_HOST : '';
        $host = $database_host;
        $port = 3306;

        if (str_contains($database_host, ':/')) {
            $host = explode(':', $database_host, 2)[0];
        } elseif (str_contains($database_host, ':')) {
            $parts = explode(':', $database_host, 2);
            $host = $parts[0];
            if (isset($parts[1]) && ctype_digit($parts[1])) {
                $port = (int) $parts[1];
            }
        }

        return array(
            'wordpressPath' => defined('ABSPATH') ? ABSPATH : null,
            'databaseHost' => $host !== '' ? $host : null,
            'databasePort' => $port,
            'databaseName' => defined('DB_NAME') ? DB_NAME : null,
            'databaseUsername' => defined('DB_USER') ? DB_USER : null,
            'databasePassword' => defined('DB_PASSWORD') ? DB_PASSWORD : null,
            'providerLabel' => php_uname('n'),
            'detectedAt' => gmdate('c'),
        );
    }
}
