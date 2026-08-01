<?php

namespace APSiteCare;

defined('ABSPATH') || exit;

final class PluginUpdateService
{
    public function execute(array $payload)
    {
        $plugin_slug = sanitize_key((string) ($payload['pluginSlug'] ?? ''));
        $plugin_file = plugin_basename(sanitize_text_field((string) ($payload['pluginFile'] ?? '')));
        $installed_version = sanitize_text_field((string) ($payload['installedVersion'] ?? ''));
        $target_version = sanitize_text_field((string) ($payload['targetVersion'] ?? ''));
        $package_url = esc_url_raw((string) ($payload['packageUrl'] ?? ''));
        $checksum = strtolower(sanitize_text_field((string) ($payload['checksumSha256'] ?? '')));
        if ($plugin_slug === '' || $plugin_file === '' || $installed_version === '' || $target_version === ''
            || $package_url === '' || !preg_match('/^[a-f0-9]{64}$/', $checksum)) {
            return new \WP_Error('apsc_invalid_update', 'The signed plugin update request is incomplete.');
        }

        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/plugin.php';
        require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
        $plugins = get_plugins();
        if (!isset($plugins[$plugin_file])) {
            return new \WP_Error('apsc_plugin_missing', 'The requested plugin file is not installed.');
        }
        $before_version = (string) ($plugins[$plugin_file]['Version'] ?? '');
        if ($before_version !== $installed_version) {
            return new \WP_Error('apsc_version_changed', 'The installed plugin version changed after dashboard preflight.');
        }
        if (version_compare($before_version, $target_version, '>=')) {
            return new \WP_Error('apsc_version_not_newer', 'The requested plugin version is not newer than the installed version.');
        }
        if (dirname($plugin_file) !== $plugin_slug) {
            return new \WP_Error('apsc_plugin_mismatch', 'The requested plugin slug does not match the installed plugin file.');
        }

        $temporary_file = download_url($package_url, 120);
        if (is_wp_error($temporary_file)) {
            return $temporary_file;
        }
        try {
            if (!hash_equals($checksum, strtolower((string) hash_file('sha256', $temporary_file)))) {
                return new \WP_Error('apsc_checksum_mismatch', 'The downloaded plugin package checksum did not match.');
            }
            $was_active = is_plugin_active($plugin_file);
            $upgrader = new \Plugin_Upgrader(new \Automatic_Upgrader_Skin());
            $result = $upgrader->install($temporary_file, array('overwrite_package' => true));
            if (is_wp_error($result)) {
                return $result;
            }
            if ($result !== true) {
                return new \WP_Error('apsc_install_failed', 'WordPress did not confirm the plugin package installation.');
            }
            wp_clean_plugins_cache(true);
            $plugins = get_plugins();
            if (!isset($plugins[$plugin_file])) {
                return new \WP_Error('apsc_plugin_identity_changed', 'The updated package did not preserve the expected plugin file.');
            }
            $resulting_version = (string) ($plugins[$plugin_file]['Version'] ?? '');
            if ($resulting_version !== $target_version) {
                return new \WP_Error('apsc_result_version_mismatch', 'The installed plugin version does not match the requested version.');
            }
            if ($was_active && !is_plugin_active($plugin_file)) {
                $activation = activate_plugin($plugin_file, '', false, true);
                if (is_wp_error($activation)) {
                    return $activation;
                }
            }
            return array(
                'beforeVersion' => $before_version,
                'resultingVersion' => $resulting_version,
                'pluginFile' => $plugin_file,
            );
        } finally {
            if (is_string($temporary_file) && file_exists($temporary_file)) {
                wp_delete_file($temporary_file);
            }
        }
    }
}
