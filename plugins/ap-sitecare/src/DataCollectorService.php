<?php

namespace APSiteCare;

defined('ABSPATH') || exit;

final class DataCollectorService
{
    public function __construct(
        private SettingsRepository $settings,
        private ?UpdateMonitorService $update_monitor = null
    ) {
    }

    public function collect(): array
    {
        if (!function_exists('get_plugins')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }
        if (!function_exists('get_plugin_updates')) {
            require_once ABSPATH . 'wp-admin/includes/update.php';
        }

        wp_version_check();
        wp_update_plugins();
        wp_update_themes();

        $plugins = $this->collect_plugins();
        $themes = $this->collect_themes();
        $core = $this->collect_core();
        $checked_at = $this->latest_checked_at();
        $inventory = array(
            'checkedAt' => $checked_at,
            'core' => $core,
            'plugins' => $plugins,
            'themes' => $themes,
        );
        $active_theme = wp_get_theme();

        return array(
            'contractVersion' => 4,
            'pluginVersion' => defined('APSC_PLUGIN_VERSION') ? APSC_PLUGIN_VERSION : null,
            'wordpressHomeUrl' => home_url('/'),
            'wordpressVersion' => get_bloginfo('version'),
            'phpVersion' => PHP_VERSION,
            'pluginUpdateCount' => count(array_filter($plugins, static fn ($plugin) => $plugin['availableVersion'] !== null)),
            'themeUpdateCount' => count(array_filter($themes, static fn ($theme) => $theme['availableVersion'] !== null)),
            'lastCronRunAt' => $this->settings->get_last_cron_run_at(),
            'coreUpdateAvailable' => $core['availableVersion'] !== null,
            'lastUpdateCheckAt' => $checked_at,
            'activeTheme' => $active_theme->exists() ? $active_theme->get('Name') : null,
            'updateInventory' => $inventory,
            'updateActivities' => $this->update_monitor
                ? $this->update_monitor->reconcile_and_get_pending($inventory)
                : array(),
            'backupSource' => $this->collect_backup_source(),
            'siteHealthEvidence' => $this->collect_sitehealth_evidence(),
        );
    }

    private function collect_core(): array
    {
        $available_version = null;
        $core_updates = get_core_updates(array('dismissed' => false));
        if (is_array($core_updates)) {
            foreach ($core_updates as $update) {
                if (is_object($update) && ($update->response ?? '') === 'upgrade') {
                    $available_version = isset($update->current) ? (string) $update->current : null;
                    break;
                }
            }
        }
        return array(
            'slug' => 'wordpress',
            'name' => 'WordPress Core',
            'installedVersion' => (string) get_bloginfo('version'),
            'availableVersion' => $available_version,
            'active' => true,
            'autoUpdateEnabled' => defined('WP_AUTO_UPDATE_CORE') && (bool) WP_AUTO_UPDATE_CORE,
            'supportStatus' => 'supported',
            'premiumLicenseStatus' => 'not-applicable',
        );
    }

    private function collect_plugins(): array
    {
        $installed = get_plugins();
        $updates = get_site_transient('update_plugins');
        $responses = is_object($updates) && isset($updates->response) && is_array($updates->response)
            ? $updates->response
            : array();
        $current_records = is_object($updates) && isset($updates->no_update) && is_array($updates->no_update)
            ? $updates->no_update
            : array();
        $auto_updates = get_site_option('auto_update_plugins', array());
        $auto_updates = is_array($auto_updates) ? $auto_updates : array();
        $result = array();

        foreach ($installed as $file => $data) {
            $offer = $responses[$file] ?? null;
            $details = $offer ?? ($current_records[$file] ?? null);
            $slug = dirname($file) === '.' ? pathinfo($file, PATHINFO_FILENAME) : dirname($file);
            $last_updated = is_object($details) && isset($details->last_updated) ? (string) $details->last_updated : null;
            $license_status = apply_filters('apsc_plugin_license_status', 'unknown', $file, $data);
            if (!in_array($license_status, array('active', 'inactive', 'unknown'), true)) {
                $license_status = 'unknown';
            }
            $result[] = array(
                'slug' => sanitize_key($slug),
                'name' => sanitize_text_field((string) ($data['Name'] ?? $slug)),
                'installedVersion' => sanitize_text_field((string) ($data['Version'] ?? 'unknown')),
                'availableVersion' => is_object($offer) && isset($offer->new_version)
                    ? sanitize_text_field((string) $offer->new_version)
                    : null,
                'active' => is_plugin_active($file) || (is_multisite() && is_plugin_active_for_network($file)),
                'autoUpdateEnabled' => in_array($file, $auto_updates, true),
                'supportStatus' => $this->support_status($last_updated),
                'premiumLicenseStatus' => $license_status,
                'pluginFile' => sanitize_text_field($file),
                'updateUri' => isset($data['UpdateURI']) ? esc_url_raw((string) $data['UpdateURI']) : null,
                'lastUpdatedAt' => $this->iso_date($last_updated),
                'requiresWordPress' => isset($data['RequiresWP']) ? sanitize_text_field((string) $data['RequiresWP']) : null,
                'requiresPhp' => isset($data['RequiresPHP']) ? sanitize_text_field((string) $data['RequiresPHP']) : null,
            );
        }
        usort($result, static fn ($left, $right) => strcasecmp($left['name'], $right['name']));
        return $result;
    }

    private function collect_themes(): array
    {
        $installed = wp_get_themes();
        $updates = get_site_transient('update_themes');
        $responses = is_object($updates) && isset($updates->response) && is_array($updates->response)
            ? $updates->response
            : array();
        $current_records = is_object($updates) && isset($updates->no_update) && is_array($updates->no_update)
            ? $updates->no_update
            : array();
        $auto_updates = get_site_option('auto_update_themes', array());
        $auto_updates = is_array($auto_updates) ? $auto_updates : array();
        $active = get_stylesheet();
        $result = array();

        foreach ($installed as $stylesheet => $theme) {
            $offer = $responses[$stylesheet] ?? null;
            $details = $offer ?? ($current_records[$stylesheet] ?? null);
            $offer_record = is_array($offer) ? $offer : (is_object($offer) ? get_object_vars($offer) : array());
            $detail_record = is_array($details) ? $details : (is_object($details) ? get_object_vars($details) : array());
            $result[] = array(
                'slug' => sanitize_key($stylesheet),
                'name' => sanitize_text_field((string) $theme->get('Name')),
                'installedVersion' => sanitize_text_field((string) ($theme->get('Version') ?: 'unknown')),
                'availableVersion' => isset($offer_record['new_version'])
                    ? sanitize_text_field((string) $offer_record['new_version'])
                    : null,
                'active' => $stylesheet === $active,
                'autoUpdateEnabled' => in_array($stylesheet, $auto_updates, true),
                'supportStatus' => $this->support_status(isset($detail_record['last_updated']) ? (string) $detail_record['last_updated'] : null),
                'premiumLicenseStatus' => 'unknown',
                'stylesheet' => sanitize_text_field($stylesheet),
                'lastUpdatedAt' => $this->iso_date(isset($detail_record['last_updated']) ? (string) $detail_record['last_updated'] : null),
                'requiresWordPress' => sanitize_text_field((string) $theme->get('RequiresWP')),
                'requiresPhp' => sanitize_text_field((string) $theme->get('RequiresPHP')),
            );
        }
        usort($result, static fn ($left, $right) => strcasecmp($left['name'], $right['name']));
        return $result;
    }

    private function latest_checked_at(): string
    {
        $timestamps = array();
        foreach (array('update_core', 'update_plugins', 'update_themes') as $key) {
            $value = get_site_transient($key);
            if (is_object($value) && isset($value->last_checked) && is_numeric($value->last_checked)) {
                $timestamps[] = (int) $value->last_checked;
            }
        }
        return gmdate('c', $timestamps ? max($timestamps) : time());
    }

    private function support_status(?string $last_updated): string
    {
        if ($last_updated === null || strtotime($last_updated) === false) {
            return 'unknown';
        }
        return strtotime($last_updated) < time() - 2 * YEAR_IN_SECONDS
            ? 'possibly-abandoned'
            : 'supported';
    }

    private function iso_date(?string $value): ?string
    {
        $timestamp = $value !== null ? strtotime($value) : false;
        return $timestamp === false ? null : gmdate('c', $timestamp);
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

    private function collect_sitehealth_evidence(): array
    {
        $cached = get_transient('apsc_sitehealth_evidence_v1');
        if (is_array($cached)) {
            return $cached;
        }

        $evidence = array(
            'collectedAt' => gmdate('c'),
            'content' => $this->collect_sitehealth_content(),
            'media' => $this->collect_sitehealth_media(),
            'users' => $this->collect_sitehealth_users(),
            'environment' => $this->collect_sitehealth_environment(),
            'database' => $this->collect_sitehealth_database(),
            'limitations' => array(
                'WordPress does not record last-login activity by default, so inactive-user status requires technician review.',
                'Unattached media is only a candidate for review and is not proof that a file is unused.',
                'Media file detail is bounded to 500 recent attachments; total media bytes is unavailable when the library exceeds that sample.',
                'Premium license status remains unavailable unless the plugin vendor exposes it through the AP SiteCare filter.',
                'Content consolidation and removal recommendations require editorial review.',
                'Broken-link checking is optional and is performed by the Dashboard when requested.',
            ),
        );
        set_transient('apsc_sitehealth_evidence_v1', $evidence, 12 * HOUR_IN_SECONDS);
        return $evidence;
    }

    private function collect_sitehealth_content(): array
    {
        $ids = get_posts(array(
            'post_type' => 'page',
            'post_status' => 'publish',
            'posts_per_page' => 500,
            'orderby' => 'modified',
            'order' => 'ASC',
            'fields' => 'ids',
            'no_found_rows' => true,
            'suppress_filters' => false,
        ));
        $pages = array();
        foreach ($ids as $id) {
            $permalink = get_permalink($id);
            if (!is_string($permalink) || $permalink === '') {
                continue;
            }
            $content = (string) get_post_field('post_content', $id, 'raw');
            $plain_text = trim(wp_strip_all_tags(strip_shortcodes($content)));
            $words = $plain_text === '' ? 0 : str_word_count($plain_text);
            $modified = get_post_modified_time('c', true, $id);
            $pages[] = array(
                'id' => (int) $id,
                'title' => sanitize_text_field((string) get_the_title($id)),
                'url' => esc_url_raw($permalink),
                'modifiedAt' => $modified ?: null,
                'wordCount' => max(0, (int) $words),
            );
        }
        $counts = wp_count_posts('page');
        return array(
            'publishedPageCount' => isset($counts->publish) ? (int) $counts->publish : count($pages),
            'pages' => $pages,
        );
    }

    private function collect_sitehealth_media(): array
    {
        $ids = get_posts(array(
            'post_type' => 'attachment',
            'post_status' => 'inherit',
            'posts_per_page' => 500,
            'orderby' => 'ID',
            'order' => 'DESC',
            'fields' => 'ids',
            'no_found_rows' => true,
        ));
        $large = array();
        $optimization = array();
        $unused = array();
        $total_bytes = 0;
        foreach ($ids as $id) {
            $attachment_url = wp_get_attachment_url($id);
            if (!is_string($attachment_url) || $attachment_url === '') {
                continue;
            }
            $file = get_attached_file($id);
            $size = is_string($file) && is_file($file) ? filesize($file) : false;
            $size_bytes = $size === false ? 0 : max(0, (int) $size);
            $total_bytes += $size_bytes;
            $mime = (string) get_post_mime_type($id);
            $item = array(
                'id' => (int) $id,
                'title' => sanitize_text_field((string) get_the_title($id)),
                'url' => esc_url_raw($attachment_url),
                'mimeType' => sanitize_text_field($mime),
                'sizeBytes' => $size_bytes,
            );
            if (str_starts_with($mime, 'image/') && $size_bytes >= 1024 * 1024) {
                $large[] = $item;
            }
            if (in_array($mime, array('image/jpeg', 'image/png'), true) && $size_bytes >= 500 * 1024) {
                $optimization[] = $item;
            }
            if ((int) wp_get_post_parent_id($id) === 0) {
                $unused[] = $item;
            }
        }
        $counts = wp_count_posts('attachment');
        $attachment_count = isset($counts->inherit) ? (int) $counts->inherit : count($ids);
        return array(
            'attachmentCount' => $attachment_count,
            'totalBytes' => $attachment_count > count($ids) ? null : $total_bytes,
            'largeImages' => array_slice($large, 0, 300),
            'optimizationCandidates' => array_slice($optimization, 0, 300),
            'unusedCandidates' => array_slice($unused, 0, 300),
        );
    }

    private function collect_sitehealth_users(): array
    {
        $users = get_users(array(
            'number' => 500,
            'orderby' => 'registered',
            'order' => 'ASC',
            'fields' => 'all_with_meta',
        ));
        return array(
            'userCount' => max(0, (int) count_users()['total_users']),
            'accounts' => array_map(static function ($user): array {
                $registered = isset($user->user_registered) ? strtotime((string) $user->user_registered . ' UTC') : false;
                return array(
                    'id' => (int) $user->ID,
                    'displayName' => sanitize_text_field((string) $user->display_name),
                    'roles' => array_values(array_map('sanitize_key', is_array($user->roles) ? $user->roles : array())),
                    'registeredAt' => $registered === false ? null : gmdate('c', $registered),
                );
            }, $users),
            'lastActivityAvailable' => false,
        );
    }

    private function collect_sitehealth_environment(): array
    {
        $uploads = wp_upload_dir();
        $uploads_bytes = isset($uploads['basedir']) ? $this->safe_directory_size((string) $uploads['basedir']) : null;
        $wordpress_bytes = defined('WP_CONTENT_DIR') ? $this->safe_directory_size(WP_CONTENT_DIR) : null;
        return array(
            'wordpressVersion' => (string) get_bloginfo('version'),
            'phpVersion' => PHP_VERSION,
            'homeUrl' => esc_url_raw(home_url('/')),
            'homeUsesHttps' => str_starts_with(strtolower(home_url('/')), 'https://'),
            'uploadsBytes' => $uploads_bytes,
            'wordpressBytes' => $wordpress_bytes,
        );
    }

    private function collect_sitehealth_database(): array
    {
        global $wpdb;
        $tables = $wpdb->get_results(
            $wpdb->prepare('SHOW TABLE STATUS LIKE %s', $wpdb->esc_like($wpdb->prefix) . '%'),
            ARRAY_A
        );
        $size = 0;
        if (is_array($tables)) {
            foreach ($tables as $table) {
                $size += (int) ($table['Data_length'] ?? 0) + (int) ($table['Index_length'] ?? 0);
            }
        }
        $revision_count = (int) $wpdb->get_var(
            $wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = %s", 'revision')
        );
        $transient_count = (int) $wpdb->get_var(
            $wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like('_transient_') . '%')
        );
        $expired_transients = (int) $wpdb->get_var(
            $wpdb->prepare(
                "SELECT COUNT(*) FROM {$wpdb->options} WHERE option_name LIKE %s AND CAST(option_value AS UNSIGNED) < %d",
                $wpdb->esc_like('_transient_timeout_') . '%',
                time()
            )
        );
        $autoload_bytes = (int) $wpdb->get_var(
            "SELECT COALESCE(SUM(LENGTH(option_value)), 0) FROM {$wpdb->options} WHERE autoload IN ('yes', 'on', 'auto-on', 'auto')"
        );
        return array(
            'sizeBytes' => max(0, $size),
            'tableCount' => is_array($tables) ? count($tables) : null,
            'revisionCount' => max(0, $revision_count),
            'transientCount' => max(0, $transient_count),
            'expiredTransientCount' => max(0, $expired_transients),
            'autoloadBytes' => max(0, $autoload_bytes),
        );
    }

    private function safe_directory_size(string $path): ?int
    {
        if ($path === '' || !is_dir($path)) {
            return null;
        }
        if (function_exists('recurse_dirsize')) {
            $size = recurse_dirsize($path);
            return is_numeric($size) ? max(0, (int) $size) : null;
        }
        return null;
    }
}
