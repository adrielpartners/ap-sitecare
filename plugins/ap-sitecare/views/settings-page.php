<?php defined('ABSPATH') || exit; ?>
<div class="wrap apsc-admin">
    <header class="apsc-page-header">
        <img class="apsc-page-header__logo" src="<?php echo esc_url(plugins_url('assets/images/Logo-SiteCare-Dark-320x90.png', APSC_PLUGIN_FILE)); ?>" alt="<?php echo esc_attr__('SiteCare', 'ap-sitecare'); ?>">
        <div>
            <p class="apsc-eyebrow"><?php echo esc_html__('Administration', 'ap-sitecare'); ?></p>
            <h1><?php echo esc_html__('AP SiteCare Settings', 'ap-sitecare'); ?></h1>
            <p><?php echo esc_html__('Connect this website to the AP SiteCare operations dashboard and control the client-facing care view.', 'ap-sitecare'); ?></p>
        </div>
    </header>

    <?php if ($notice !== '') : ?>
        <div class="notice notice-success is-dismissible"><p><?php echo esc_html($notice); ?></p></div>
    <?php endif; ?>
    <?php if ($error !== '') : ?>
        <div class="notice notice-error is-dismissible"><p><?php echo esc_html($error); ?></p></div>
    <?php endif; ?>

    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
        <input type="hidden" name="action" value="apsc_save_settings">
        <?php wp_nonce_field('apsc_save_settings'); ?>

        <section class="apsc-card apsc-settings-section">
            <div class="apsc-section-heading">
                <div>
                    <p class="apsc-eyebrow"><?php echo esc_html__('Connection', 'ap-sitecare'); ?></p>
                    <h2><?php echo esc_html__('Dashboard credentials', 'ap-sitecare'); ?></h2>
                </div>
                <span class="apsc-badge apsc-badge--<?php echo esc_attr($settings['site_secret'] !== '' ? 'success' : 'unknown'); ?>">
                    <?php echo esc_html($settings['site_secret'] !== '' ? __('Configured', 'ap-sitecare') : __('Not configured', 'ap-sitecare')); ?>
                </span>
            </div>
            <div class="apsc-settings-grid">
                <label class="apsc-field">
                    <span><?php echo esc_html__('Dashboard URL', 'ap-sitecare'); ?></span>
                    <input name="dashboard_url" type="url" required value="<?php echo esc_attr($settings['dashboard_url']); ?>" placeholder="https://sitecare.example.com">
                </label>
                <label class="apsc-field">
                    <span><?php echo esc_html__('Site ID', 'ap-sitecare'); ?></span>
                    <input name="site_id" type="text" required value="<?php echo esc_attr($settings['site_id']); ?>" autocomplete="off">
                </label>
                <label class="apsc-field apsc-field--wide">
                    <span><?php echo esc_html__('Site Secret', 'ap-sitecare'); ?></span>
                    <input name="site_secret" type="password" value="" autocomplete="new-password" placeholder="<?php echo esc_attr($settings['site_secret'] !== '' ? __('Saved securely. Enter a new secret only to replace it.', 'ap-sitecare') : __('Enter the issued site secret', 'ap-sitecare')); ?>">
                    <small><?php echo esc_html__('The saved secret is never displayed. Leaving this field blank preserves the existing secret.', 'ap-sitecare'); ?></small>
                </label>
            </div>
        </section>

        <section class="apsc-card apsc-settings-section">
            <div class="apsc-section-heading">
                <div>
                    <p class="apsc-eyebrow"><?php echo esc_html__('Client visibility', 'ap-sitecare'); ?></p>
                    <h2><?php echo esc_html__('Care screen preferences', 'ap-sitecare'); ?></h2>
                </div>
            </div>
            <div class="apsc-settings-grid">
                <label class="apsc-field">
                    <span><?php echo esc_html__('Plan label override', 'ap-sitecare'); ?></span>
                    <input name="plan_label" type="text" value="<?php echo esc_attr($settings['plan_label']); ?>" placeholder="<?php echo esc_attr__('Website Care Plan', 'ap-sitecare'); ?>">
                </label>
                <div class="apsc-toggle-list apsc-field--wide">
                    <?php
                    $toggles = array(
                        'enable_client_view' => __('Enable client-facing AP SiteCare screen', 'ap-sitecare'),
                        'enable_dashboard_widget' => __('Enable WordPress Dashboard widget', 'ap-sitecare'),
                        'show_security' => __('Show security section', 'ap-sitecare'),
                        'show_backups' => __('Show backups section', 'ap-sitecare'),
                        'show_updates' => __('Show updates section', 'ap-sitecare'),
                        'show_uptime' => __('Show uptime section', 'ap-sitecare'),
                        'show_service_time' => __('Show service-time section when available', 'ap-sitecare'),
                    );
                    ?>
                    <?php foreach ($toggles as $key => $label) : ?>
                        <label class="apsc-toggle">
                            <input type="checkbox" name="<?php echo esc_attr($key); ?>" value="1" <?php checked($settings[$key]); ?>>
                            <span><?php echo esc_html($label); ?></span>
                        </label>
                    <?php endforeach; ?>
                </div>
            </div>
        </section>

        <div class="apsc-form-actions">
            <?php submit_button(esc_html__('Save Settings', 'ap-sitecare'), 'primary', 'submit', false); ?>
        </div>
    </form>

    <section class="apsc-card apsc-settings-section">
        <div class="apsc-section-heading">
            <div>
                <p class="apsc-eyebrow"><?php echo esc_html__('Reporter', 'ap-sitecare'); ?></p>
                <h2><?php echo esc_html__('Connection tools', 'ap-sitecare'); ?></h2>
                <p><?php echo esc_html__('The reporter checks in hourly through WP-Cron. These actions are safe and observation-only.', 'ap-sitecare'); ?></p>
            </div>
        </div>
        <div class="apsc-form-actions">
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                <input type="hidden" name="action" value="apsc_test_connection">
                <?php wp_nonce_field('apsc_test_connection'); ?>
                <?php submit_button(esc_html__('Test Connection', 'ap-sitecare'), 'secondary', 'submit', false); ?>
            </form>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                <input type="hidden" name="action" value="apsc_manual_check_in">
                <?php wp_nonce_field('apsc_manual_check_in'); ?>
                <?php submit_button(esc_html__('Send Manual Check-In', 'ap-sitecare'), 'primary', 'submit', false); ?>
            </form>
        </div>
    </section>
</div>
