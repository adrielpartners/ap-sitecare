<?php

namespace APSiteCare;

defined('ABSPATH') || exit;

final class ReporterService
{
    public function __construct(
        private SettingsRepository $settings,
        private DataCollectorService $collector,
        private ApiClientService $client
    ) {
    }

    public function test_connection(): array
    {
        return $this->request('/api/plugin/test-connection', array());
    }

    public function check_in(): array
    {
        $response = $this->request('/api/plugin/check-in', $this->collector->collect());
        if (isset($response['connection']['rotation']) && is_array($response['connection']['rotation'])) {
            $this->settings->apply_rotation($response['connection']['rotation']);
        }
        if (isset($response['acceptedActivityIds']) && is_array($response['acceptedActivityIds'])) {
            $this->settings->acknowledge_update_activities($response['acceptedActivityIds']);
        }
        return $response;
    }

    private function request(string $path, array $payload): array
    {
        $settings = $this->settings->get_all();
        if ($settings['dashboard_url'] === '' || $settings['site_id'] === '' || $settings['site_secret'] === '') {
            throw new \RuntimeException('Dashboard URL, Site ID, and Site Secret are required.');
        }

        return $this->client->post_with_fallback(
            $settings['dashboard_url'],
            $path,
            $settings['site_id'],
            $settings['site_secret'],
            $settings['previous_site_secret'],
            $settings['previous_site_secret_valid_until'],
            $payload
        );
    }
}
