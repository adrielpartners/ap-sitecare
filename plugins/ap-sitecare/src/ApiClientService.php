<?php

namespace APSiteCare;

defined('ABSPATH') || exit;

final class ApiClientService
{
    public function post(string $dashboard_url, string $path, string $site_id, string $secret, array $payload): array
    {
        $body = wp_json_encode($payload);
        $timestamp = gmdate('c');
        $signature = hash_hmac('sha256', $timestamp . '.' . $body, $secret);
        $response = wp_remote_post($dashboard_url . $path, array(
            'timeout' => 20,
            'headers' => array(
                'Content-Type' => 'application/json',
                'X-APSC-Site-ID' => $site_id,
                'X-APSC-Timestamp' => $timestamp,
                'X-APSC-Signature' => $signature,
            ),
            'body' => $body,
        ));

        if (is_wp_error($response)) {
            throw new \RuntimeException($response->get_error_message());
        }

        $status = wp_remote_retrieve_response_code($response);
        $response_body = json_decode(wp_remote_retrieve_body($response), true);
        if ($status < 200 || $status >= 300) {
            $message = is_array($response_body) && isset($response_body['statusMessage'])
                ? $response_body['statusMessage']
                : 'AP SiteCare rejected the request.';
            throw new \RuntimeException(sanitize_text_field($message));
        }

        return is_array($response_body) ? $response_body : array();
    }
}
