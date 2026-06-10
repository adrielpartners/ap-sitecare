<?php defined('ABSPATH') || exit; ?>
<div class="wrap">
    <h1><?php echo esc_html__('AP SiteCare Reporter', 'ap-sitecare'); ?></h1>
    <p><?php echo esc_html__('Connect this WordPress site to the AP SiteCare operations dashboard.', 'ap-sitecare'); ?></p>

    <?php if ($notice !== '') : ?>
        <div class="notice notice-success is-dismissible"><p><?php echo esc_html($notice); ?></p></div>
    <?php endif; ?>
    <?php if ($error !== '') : ?>
        <div class="notice notice-error is-dismissible"><p><?php echo esc_html($error); ?></p></div>
    <?php endif; ?>

    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
        <input type="hidden" name="action" value="apsc_save_settings">
        <?php wp_nonce_field('apsc_save_settings'); ?>
        <table class="form-table" role="presentation">
            <tr>
                <th scope="row"><label for="apsc-dashboard-url"><?php echo esc_html__('Dashboard URL', 'ap-sitecare'); ?></label></th>
                <td><input class="regular-text" id="apsc-dashboard-url" name="dashboard_url" type="url" required value="<?php echo esc_attr($settings['dashboard_url']); ?>"></td>
            </tr>
            <tr>
                <th scope="row"><label for="apsc-site-id"><?php echo esc_html__('Site ID', 'ap-sitecare'); ?></label></th>
                <td><input class="regular-text code" id="apsc-site-id" name="site_id" type="text" required value="<?php echo esc_attr($settings['site_id']); ?>"></td>
            </tr>
            <tr>
                <th scope="row"><label for="apsc-site-secret"><?php echo esc_html__('Site Secret', 'ap-sitecare'); ?></label></th>
                <td><input class="regular-text code" id="apsc-site-secret" name="site_secret" type="password" required value="<?php echo esc_attr($settings['site_secret']); ?>" autocomplete="off"></td>
            </tr>
        </table>
        <?php submit_button(esc_html__('Save Settings', 'ap-sitecare')); ?>
    </form>

    <hr>
    <h2><?php echo esc_html__('Connection', 'ap-sitecare'); ?></h2>
    <p><?php echo esc_html__('The reporter checks in hourly through WP-Cron. Use these controls to verify or report immediately.', 'ap-sitecare'); ?></p>
    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="display:inline-block;margin-right:8px">
        <input type="hidden" name="action" value="apsc_test_connection">
        <?php wp_nonce_field('apsc_test_connection'); ?>
        <?php submit_button(esc_html__('Test Connection', 'ap-sitecare'), 'secondary', 'submit', false); ?>
    </form>
    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="display:inline-block">
        <input type="hidden" name="action" value="apsc_manual_check_in">
        <?php wp_nonce_field('apsc_manual_check_in'); ?>
        <?php submit_button(esc_html__('Send Check-In', 'ap-sitecare'), 'primary', 'submit', false); ?>
    </form>
</div>
