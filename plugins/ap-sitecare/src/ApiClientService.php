<?php

namespace APSiteCare;

defined('ABSPATH') || exit;

final class ApiClientService
{
    public function post(string $dashboard_url, string $path, string $site_id, string $secret, array $payload): array
    {
        return $this->post_with_fallback($dashboard_url, $path, $site_id, $secret, '', '', $payload);
    }

    public function post_with_fallback(
        string $dashboard_url,
        string $path,
        string $site_id,
        string $secret,
        string $previous_secret,
        string $previous_secret_valid_until,
        array $payload
    ): array
    {
        try {
            return $this->send($dashboard_url, $path, $site_id, $secret, $payload);
        } catch (ApiRequestException $error) {
            $previous_is_valid = $previous_secret !== ''
                && $previous_secret_valid_until !== ''
                && strtotime($previous_secret_valid_until) > time();
            if ($error->status_code !== 401 || !$previous_is_valid) {
                throw $error;
            }
            return $this->send($dashboard_url, $path, $site_id, $previous_secret, $payload);
        }
    }

    private function send(string $dashboard_url, string $path, string $site_id, string $secret, array $payload): array
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
            throw new ApiRequestException(sanitize_text_field($message), $status);
        }

        return is_array($response_body) ? $response_body : array();
    }
}

final class ApiRequestException extends \RuntimeException
{
    public function __construct(string $message, public int $status_code)
    {
        parent::__construct($message);
    }
}
