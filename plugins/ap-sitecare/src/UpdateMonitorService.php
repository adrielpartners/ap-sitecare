<?php

namespace APSiteCare;

defined('ABSPATH') || exit;

final class UpdateMonitorService
{
    private const BASELINE_KEY = 'apsc_update_inventory_baseline';
    private const QUEUE_KEY = 'apsc_update_activity_queue';

    public function register_hooks(): void
    {
        add_filter('upgrader_install_package_result', array($this, 'record_install_result'), 10, 2);
        add_action('upgrader_process_complete', array($this, 'record_completed_update'), 10, 2);
        add_action('automatic_updates_complete', array($this, 'record_automatic_results'));
        add_action('apsc_update_activities_acknowledged', array($this, 'acknowledge'));
    }

    public function reconcile_and_get_pending(array $inventory): array
    {
        $current = $this->flatten_inventory($inventory);
        $previous = get_option(self::BASELINE_KEY, array());
        $previous = is_array($previous) ? $previous : array();
        if ($previous) {
            foreach ($current as $key => $component) {
                $prior = $previous[$key] ?? null;
                if (!is_array($prior) || ($prior['version'] ?? null) === $component['version']) {
                    continue;
                }
                if ($this->queue_has_result($component['type'], $component['slug'], $component['version'])) {
                    continue;
                }
                $this->enqueue(array(
                    'componentType' => $component['type'],
                    'slug' => $component['slug'],
                    'name' => $component['name'],
                    'priorVersion' => isset($prior['version']) ? (string) $prior['version'] : null,
                    'targetVersion' => $component['version'],
                    'resultingVersion' => $component['version'],
                    'startedAt' => null,
                    'completedAt' => gmdate('c'),
                    'outcome' => 'observed',
                    'errorCode' => null,
                    'errorMessage' => null,
                    'source' => 'inventory-reconciliation',
                ));
            }
        }
        update_option(self::BASELINE_KEY, $current, false);
        return array_values($this->queue());
    }

    public function record_install_result($result, array $hook_extra)
    {
        if (is_wp_error($result)) {
            foreach ($this->components_from_hook($hook_extra) as $component) {
                $this->record_failure($component, $result, 'wordpress-upgrader');
            }
        }
        return $result;
    }

    public function record_completed_update($upgrader, array $hook_extra): void
    {
        if (($hook_extra['action'] ?? '') !== 'update') {
            return;
        }
        foreach ($this->components_from_hook($hook_extra) as $component) {
            $version = $this->current_version($component['type'], $component['slug']);
            $prior = $this->baseline_version($component['type'], $component['slug']);
            $this->enqueue(array(
                'componentType' => $component['type'],
                'slug' => $component['slug'],
                'name' => $component['name'],
                'priorVersion' => $prior,
                'targetVersion' => $version,
                'resultingVersion' => $version,
                'startedAt' => null,
                'completedAt' => gmdate('c'),
                'outcome' => 'succeeded',
                'errorCode' => null,
                'errorMessage' => null,
                'source' => 'wordpress-upgrader',
            ));
        }
    }

    public function record_automatic_results(array $results): void
    {
        foreach (array('core', 'plugin', 'theme') as $type) {
            $entries = isset($results[$type]) && is_array($results[$type]) ? $results[$type] : array();
            foreach ($entries as $entry) {
                $record = is_object($entry) ? get_object_vars($entry) : (is_array($entry) ? $entry : array());
                $result = $record['result'] ?? null;
                if (!is_wp_error($result)) {
                    continue;
                }
                $item = isset($record['item']) && is_object($record['item']) ? get_object_vars($record['item']) : array();
                $slug = sanitize_key((string) ($item['plugin'] ?? $item['theme'] ?? $item['slug'] ?? ($type === 'core' ? 'wordpress' : 'unknown')));
                $this->record_failure(array(
                    'type' => $type,
                    'slug' => $slug,
                    'name' => sanitize_text_field((string) ($item['name'] ?? $slug)),
                ), $result, 'wordpress-automatic-updater');
            }
        }
    }

    public function acknowledge(array $activity_ids): void
    {
        $queue = $this->queue();
        foreach ($activity_ids as $activity_id) {
            unset($queue[sanitize_text_field((string) $activity_id)]);
        }
        update_option(self::QUEUE_KEY, $queue, false);
    }

    private function enqueue(array $activity): void
    {
        $queue = $this->queue();
        foreach ($queue as $existing) {
            if (($existing['componentType'] ?? null) === $activity['componentType']
                && ($existing['slug'] ?? null) === $activity['slug']
                && ($existing['outcome'] ?? null) === $activity['outcome']
                && ($existing['resultingVersion'] ?? null) === $activity['resultingVersion']
                && strtotime((string) ($existing['completedAt'] ?? '')) >= time() - 5 * MINUTE_IN_SECONDS) {
                return;
            }
        }
        $activity['id'] = wp_generate_uuid4();
        $queue[$activity['id']] = $activity;
        if (count($queue) > 200) {
            $queue = array_slice($queue, -200, null, true);
        }
        update_option(self::QUEUE_KEY, $queue, false);
    }

    private function queue(): array
    {
        $queue = get_option(self::QUEUE_KEY, array());
        return is_array($queue) ? $queue : array();
    }

    private function queue_has_result(string $type, string $slug, string $version): bool
    {
        foreach ($this->queue() as $activity) {
            if (($activity['componentType'] ?? null) === $type
                && ($activity['slug'] ?? null) === $slug
                && ($activity['resultingVersion'] ?? null) === $version
                && in_array($activity['outcome'] ?? null, array('succeeded', 'observed'), true)) {
                return true;
            }
        }
        return false;
    }

    private function record_failure(array $component, \WP_Error $error, string $source): void
    {
        $this->enqueue(array(
            'componentType' => $component['type'],
            'slug' => $component['slug'],
            'name' => $component['name'],
            'priorVersion' => $this->baseline_version($component['type'], $component['slug']),
            'targetVersion' => null,
            'resultingVersion' => $this->current_version($component['type'], $component['slug']),
            'startedAt' => null,
            'completedAt' => gmdate('c'),
            'outcome' => 'failed',
            'errorCode' => sanitize_key((string) $error->get_error_code()),
            'errorMessage' => sanitize_text_field($error->get_error_message()),
            'source' => $source,
        ));
    }

    private function components_from_hook(array $hook_extra): array
    {
        $type = (string) ($hook_extra['type'] ?? '');
        if (!in_array($type, array('core', 'plugin', 'theme'), true)) {
            return array();
        }
        if ($type === 'core') {
            return array(array('type' => 'core', 'slug' => 'wordpress', 'name' => 'WordPress Core'));
        }
        $values = array();
        if ($type === 'plugin') {
            $values = isset($hook_extra['plugins']) && is_array($hook_extra['plugins'])
                ? $hook_extra['plugins']
                : array($hook_extra['plugin'] ?? '');
        } else {
            $values = isset($hook_extra['themes']) && is_array($hook_extra['themes'])
                ? $hook_extra['themes']
                : array($hook_extra['theme'] ?? '');
        }
        $components = array();
        foreach (array_filter($values) as $value) {
            $slug = $type === 'plugin'
                ? (dirname((string) $value) === '.' ? pathinfo((string) $value, PATHINFO_FILENAME) : dirname((string) $value))
                : (string) $value;
            $components[] = array('type' => $type, 'slug' => sanitize_key($slug), 'name' => sanitize_text_field($slug));
        }
        return $components;
    }

    private function flatten_inventory(array $inventory): array
    {
        $items = array_merge(
            isset($inventory['core']) && is_array($inventory['core']) ? array($inventory['core'] + array('componentType' => 'core')) : array(),
            isset($inventory['plugins']) && is_array($inventory['plugins']) ? array_map(static fn ($item) => $item + array('componentType' => 'plugin'), $inventory['plugins']) : array(),
            isset($inventory['themes']) && is_array($inventory['themes']) ? array_map(static fn ($item) => $item + array('componentType' => 'theme'), $inventory['themes']) : array()
        );
        $result = array();
        foreach ($items as $item) {
            $type = sanitize_key((string) ($item['componentType'] ?? ''));
            $slug = sanitize_key((string) ($item['slug'] ?? ''));
            if ($type === '' || $slug === '') {
                continue;
            }
            $result[$type . ':' . $slug] = array(
                'type' => $type,
                'slug' => $slug,
                'name' => sanitize_text_field((string) ($item['name'] ?? $slug)),
                'version' => sanitize_text_field((string) ($item['installedVersion'] ?? 'unknown')),
            );
        }
        return $result;
    }

    private function baseline_version(string $type, string $slug): ?string
    {
        $baseline = get_option(self::BASELINE_KEY, array());
        return is_array($baseline) && isset($baseline[$type . ':' . $slug]['version'])
            ? (string) $baseline[$type . ':' . $slug]['version']
            : null;
    }

    private function current_version(string $type, string $slug): ?string
    {
        if ($type === 'core') {
            return (string) get_bloginfo('version');
        }
        if ($type === 'theme') {
            $theme = wp_get_theme($slug);
            return $theme->exists() ? (string) $theme->get('Version') : null;
        }
        if (!function_exists('get_plugins')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }
        foreach (get_plugins() as $file => $data) {
            $candidate = dirname($file) === '.' ? pathinfo($file, PATHINFO_FILENAME) : dirname($file);
            if (sanitize_key($candidate) === $slug) {
                return isset($data['Version']) ? (string) $data['Version'] : null;
            }
        }
        return null;
    }
}
