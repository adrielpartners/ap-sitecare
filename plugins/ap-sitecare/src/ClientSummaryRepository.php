<?php

namespace APSiteCare;

defined('ABSPATH') || exit;

final class ClientSummaryRepository
{
    private const OPTION_KEY = 'apsc_client_summary_cache';

    public function get(): ?array
    {
        $cached = get_option(self::OPTION_KEY);
        if (!is_array($cached) || !isset($cached['data']) || !is_array($cached['data'])) {
            return null;
        }

        return array(
            'data' => $cached['data'],
            'fetched_at' => isset($cached['fetched_at']) ? (string) $cached['fetched_at'] : null,
        );
    }

    public function save(array $data): void
    {
        update_option(self::OPTION_KEY, array(
            'data' => $data,
            'fetched_at' => gmdate('c'),
        ), false);
    }
}
