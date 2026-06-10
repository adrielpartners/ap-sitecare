<?php
defined('ABSPATH') || exit;
$widget_status_labels = array(
    'protected' => __('Protected', 'ap-sitecare'),
    'attention' => __('Needs Attention', 'ap-sitecare'),
    'unknown' => __('Unknown', 'ap-sitecare'),
);
$widget_status = $view_data['overall']['status'];
$widget_date = static function ($value): string {
    if (!is_string($value) || $value === '') {
        return __('Not available yet', 'ap-sitecare');
    }
    $timestamp = strtotime($value);
    return $timestamp ? wp_date(get_option('date_format'), $timestamp) : __('Not available yet', 'ap-sitecare');
};
?>
<div class="apsc-widget">
    <div class="apsc-widget__status apsc-widget__status--<?php echo esc_attr($widget_status); ?>">
        <img src="<?php echo esc_url(plugins_url('assets/images/Symbol-SiteCare-600x600.png', APSC_PLUGIN_FILE)); ?>" alt="">
        <div><span><?php echo esc_html__('Overall status', 'ap-sitecare'); ?></span><strong><?php echo esc_html($widget_status_labels[$widget_status]); ?></strong></div>
    </div>
    <dl class="apsc-widget__metrics">
        <div><dt><?php echo esc_html__('Last backup', 'ap-sitecare'); ?></dt><dd><?php echo esc_html($widget_date($view_data['backups']['lastDailyBackupAt'] ?? null)); ?></dd></div>
        <div><dt><?php echo esc_html__('Last update check', 'ap-sitecare'); ?></dt><dd><?php echo esc_html($widget_date($view_data['updates']['last_checked_at'])); ?></dd></div>
        <div><dt><?php echo esc_html__('Threats blocked this month', 'ap-sitecare'); ?></dt><dd><?php echo esc_html(($view_data['security']['threatsBlockedThisMonth'] ?? null) === null ? __('Not available yet', 'ap-sitecare') : (string) $view_data['security']['threatsBlockedThisMonth']); ?></dd></div>
    </dl>
    <a class="button button-primary" href="<?php echo esc_url(admin_url('admin.php?page=ap-sitecare')); ?>"><?php echo esc_html__('View full care status', 'ap-sitecare'); ?></a>
</div>
