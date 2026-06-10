<?php

namespace APSiteCare;

defined('ABSPATH') || exit;

final class ClientAdminController
{
    public function __construct(private SettingsRepository $settings, private ClientCareService $client_care)
    {
    }

    public function register_hooks(): void
    {
        add_action('admin_menu', array($this, 'register_menu'), 10);
        add_action('wp_dashboard_setup', array($this, 'register_dashboard_widget'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_assets'));
    }

    public function register_menu(): void
    {
        $settings = $this->settings->get_all();
        $capability = $settings['enable_client_view'] ? 'read' : 'manage_options';

        add_menu_page(
            'AP SiteCare',
            'AP SiteCare',
            $capability,
            'ap-sitecare',
            array($this, 'render_main_page'),
            'dashicons-shield-alt',
            3
        );
    }

    public function render_main_page(): void
    {
        $settings = $this->settings->get_all();
        $capability = $settings['enable_client_view'] ? 'read' : 'manage_options';
        if (!current_user_can($capability)) {
            wp_die(esc_html__('You do not have permission to view AP SiteCare.', 'ap-sitecare'));
        }

        $view_data = $this->client_care->get_view_data();
        require APSC_PLUGIN_DIR . 'views/client-dashboard-page.php';
    }

    public function register_dashboard_widget(): void
    {
        $settings = $this->settings->get_all();
        if (!$settings['enable_client_view'] || !$settings['enable_dashboard_widget'] || !current_user_can('read')) {
            return;
        }

        wp_add_dashboard_widget(
            'apsc_client_dashboard_widget',
            esc_html__('AP SiteCare', 'ap-sitecare'),
            array($this, 'render_dashboard_widget')
        );
    }

    public function render_dashboard_widget(): void
    {
        if (!current_user_can('read')) {
            return;
        }

        $view_data = $this->client_care->get_view_data();
        require APSC_PLUGIN_DIR . 'views/dashboard-widget.php';
    }

    public function enqueue_assets(string $hook_suffix): void
    {
        $settings = $this->settings->get_all();
        $is_plugin_page = in_array($hook_suffix, array(
            'toplevel_page_ap-sitecare',
            'ap-sitecare_page_ap-sitecare-settings',
        ), true);
        $is_widget_page = $hook_suffix === 'index.php'
            && $settings['enable_client_view']
            && $settings['enable_dashboard_widget'];

        if (!$is_plugin_page && !$is_widget_page) {
            return;
        }

        wp_enqueue_style(
            'ap-sitecare-admin',
            plugins_url('assets/css/admin.css', APSC_PLUGIN_FILE),
            array(),
            APSC_PLUGIN_VERSION
        );
    }
}
