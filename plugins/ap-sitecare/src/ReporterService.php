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
        return $this->request('/api/plugin/check-in', $this->collector->collect());
    }

    private function request(string $path, array $payload): array
    {
        $settings = $this->settings->get_all();
        if ($settings['dashboard_url'] === '' || $settings['site_id'] === '' || $settings['site_secret'] === '') {
            throw new \RuntimeException('Dashboard URL, Site ID, and Site Secret are required.');
        }

        return $this->client->post(
            $settings['dashboard_url'],
            $path,
            $settings['site_id'],
            $settings['site_secret'],
            $payload
        );
    }
}
