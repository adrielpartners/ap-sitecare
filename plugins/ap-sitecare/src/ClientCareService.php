<?php

namespace APSiteCare;

defined('ABSPATH') || exit;

final class ClientCareService
{
    public function __construct(
        private SettingsRepository $settings,
        private DataCollectorService $collector,
        private ApiClientService $client,
        private ClientSummaryRepository $summary
    ) {
    }

    public function refresh_remote_summary(): array
    {
        $settings = $this->settings->get_all();
        if ($settings['dashboard_url'] === '' || $settings['site_id'] === '' || $settings['site_secret'] === '') {
            throw new \RuntimeException('Dashboard URL, Site ID, and Site Secret are required.');
        }

        $response = $this->client->post(
            $settings['dashboard_url'],
            '/api/plugin/client-summary',
            $settings['site_id'],
            $settings['site_secret'],
            array()
        );
        $data = isset($response['data']) && is_array($response['data']) ? $response['data'] : null;
        if ($data === null) {
            throw new \RuntimeException('AP SiteCare did not return a client summary.');
        }

        $this->summary->save($data);
        return $data;
    }

    public function get_view_data(): array
    {
        $settings = $this->settings->get_all();
        $local = $this->collector->collect();
        $cached = $this->summary->get();
        $remote = $cached['data'] ?? array();
        $remote_overall = isset($remote['overall']) && is_array($remote['overall']) ? $remote['overall'] : array();
        $cache_is_fresh = $this->cache_is_fresh($cached['fetched_at'] ?? null);
        $status = $cache_is_fresh && isset($remote_overall['status'])
            ? (string) $remote_overall['status']
            : 'unknown';

        if ($local['coreUpdateAvailable'] || $local['pluginUpdateCount'] > 0 || $local['themeUpdateCount'] > 0) {
            $status = 'attention';
        }
        if (!in_array($status, array('protected', 'attention', 'unknown'), true)) {
            $status = 'unknown';
        }

        return array(
            'overall' => array(
                'status' => $status,
                'reason' => $cache_is_fresh && isset($remote_overall['reason'])
                    ? (string) $remote_overall['reason']
                    : '',
                'checked_at' => isset($remote_overall['checkedAt']) ? (string) $remote_overall['checkedAt'] : null,
            ),
            'recent_activity' => isset($remote['recentActivity']) && is_array($remote['recentActivity'])
                ? $remote['recentActivity']
                : array(),
            'security' => $this->remote_section($remote, 'security'),
            'backups' => $this->remote_section($remote, 'backups'),
            'uptime' => $this->remote_section($remote, 'uptime'),
            'updates' => array(
                'wordpress_version' => $local['wordpressVersion'],
                'core_update_available' => $local['coreUpdateAvailable'],
                'plugin_update_count' => $local['pluginUpdateCount'],
                'theme_update_count' => $local['themeUpdateCount'],
                'last_checked_at' => $local['lastUpdateCheckAt'],
                'active_theme' => $local['activeTheme'],
            ),
            'service_time' => isset($remote['serviceTime']) && is_array($remote['serviceTime'])
                ? $remote['serviceTime']
                : null,
            'plan_label' => $settings['plan_label'],
            'cache_fetched_at' => $cached['fetched_at'] ?? null,
            'cache_is_stale' => !$cache_is_fresh,
        );
    }

    private function remote_section(array $remote, string $key): array
    {
        return isset($remote[$key]) && is_array($remote[$key])
            ? $remote[$key]
            : array('status' => 'unknown');
    }

    private function cache_is_fresh(?string $fetched_at): bool
    {
        if ($fetched_at === null) {
            return false;
        }

        $timestamp = strtotime($fetched_at);
        return $timestamp !== false && $timestamp >= time() - DAY_IN_SECONDS;
    }
}
