<?php

namespace APSiteCare;

defined('ABSPATH') || exit;

final class AdminController
{
    public function __construct(private SettingsRepository $settings, private ReporterService $reporter)
    {
    }

    public function register_hooks(): void
    {
        add_action('admin_menu', array($this, 'register_menu'));
        add_action('admin_post_apsc_save_settings', array($this, 'save_settings'));
        add_action('admin_post_apsc_test_connection', array($this, 'test_connection'));
        add_action('admin_post_apsc_manual_check_in', array($this, 'manual_check_in'));
    }

    public function register_menu(): void
    {
        add_options_page(
            'AP SiteCare',
            'AP SiteCare',
            'manage_options',
            'ap-sitecare',
            array($this, 'render_page')
        );
    }

    public function render_page(): void
    {
        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('You do not have permission to manage AP SiteCare.', 'ap-sitecare'));
        }

        $settings = $this->settings->get_all();
        $notice = isset($_GET['apsc_notice']) ? sanitize_text_field(wp_unslash($_GET['apsc_notice'])) : '';
        $error = isset($_GET['apsc_error']) ? sanitize_text_field(wp_unslash($_GET['apsc_error'])) : '';
        require APSC_PLUGIN_DIR . 'views/settings-page.php';
    }

    public function save_settings(): void
    {
        $this->authorize('apsc_save_settings');
        $this->settings->save(wp_unslash($_POST));
        $this->redirect('Settings saved.', '');
    }

    public function test_connection(): void
    {
        $this->run_action('apsc_test_connection', fn () => $this->reporter->test_connection(), 'Connection verified.');
    }

    public function manual_check_in(): void
    {
        $this->run_action('apsc_manual_check_in', fn () => $this->reporter->check_in(), 'Check-in recorded.');
    }

    private function run_action(string $nonce_action, callable $action, string $success): void
    {
        $this->authorize($nonce_action);
        try {
            $action();
            $this->redirect($success, '');
        } catch (\Throwable $error) {
            $this->redirect('', $error->getMessage());
        }
    }

    private function authorize(string $nonce_action): void
    {
        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('You do not have permission to manage AP SiteCare.', 'ap-sitecare'));
        }
        check_admin_referer($nonce_action);
    }

    private function redirect(string $notice, string $error): void
    {
        wp_safe_redirect(add_query_arg(array(
            'page' => 'ap-sitecare',
            'apsc_notice' => $notice,
            'apsc_error' => $error,
        ), admin_url('options-general.php')));
        exit;
    }
}
