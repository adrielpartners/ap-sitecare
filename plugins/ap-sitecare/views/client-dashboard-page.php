<?php
defined('ABSPATH') || exit;

$status_labels = array(
    'protected' => __('Protected', 'ap-sitecare'),
    'attention' => __('Needs Attention', 'ap-sitecare'),
    'unknown' => __('Unknown', 'ap-sitecare'),
);
$status = $view_data['overall']['status'];
$format_date = static function ($value): string {
    if (!is_string($value) || $value === '') {
        return __('Not available yet', 'ap-sitecare');
    }
    $timestamp = strtotime($value);
    return $timestamp ? wp_date(get_option('date_format') . ' ' . get_option('time_format'), $timestamp) : __('Not available yet', 'ap-sitecare');
};
$value_or_unknown = static function ($value): string {
    return $value === null || $value === '' ? __('Not available yet', 'ap-sitecare') : (string) $value;
};
?>
<div class="wrap apsc-admin">
    <header class="apsc-page-header">
        <img class="apsc-page-header__logo" src="<?php echo esc_url(plugins_url('assets/images/Logo-SiteCare-Dark-320x90.png', APSC_PLUGIN_FILE)); ?>" alt="<?php echo esc_attr__('SiteCare', 'ap-sitecare'); ?>">
        <div>
            <p class="apsc-eyebrow"><?php echo esc_html($view_data['plan_label'] !== '' ? $view_data['plan_label'] : __('Website Care', 'ap-sitecare')); ?></p>
            <h1><?php echo esc_html__('Your website is in good hands.', 'ap-sitecare'); ?></h1>
            <p><?php echo esc_html__('Your website is being monitored, updated, backed up, and protected by Adriel Partners.', 'ap-sitecare'); ?></p>
        </div>
    </header>

    <?php if (!$settings['enable_client_view']) : ?>
        <div class="notice notice-warning"><p><?php echo esc_html__('The client-facing AP SiteCare screen is currently disabled for non-administrators.', 'ap-sitecare'); ?></p></div>
    <?php endif; ?>

    <section class="apsc-hero apsc-hero--<?php echo esc_attr($status); ?>">
        <div class="apsc-status-symbol" aria-hidden="true">
            <img src="<?php echo esc_url(plugins_url('assets/images/Symbol-SiteCare-600x600.png', APSC_PLUGIN_FILE)); ?>" alt="">
        </div>
        <div>
            <p class="apsc-eyebrow"><?php echo esc_html__('Overall status', 'ap-sitecare'); ?></p>
            <h2><?php echo esc_html($status_labels[$status]); ?></h2>
            <p><?php echo esc_html($view_data['overall']['reason'] !== '' ? $view_data['overall']['reason'] : __('Your latest care summary will appear after AP SiteCare receives and verifies site data.', 'ap-sitecare')); ?></p>
        </div>
        <div class="apsc-hero__meta">
            <span><?php echo esc_html__('Last verified', 'ap-sitecare'); ?></span>
            <strong><?php echo esc_html($format_date($view_data['overall']['checked_at'])); ?></strong>
        </div>
    </section>

    <div class="apsc-layout">
        <main class="apsc-main-column">
            <?php if ($settings['show_updates']) : ?>
                <section class="apsc-card">
                    <div class="apsc-section-heading">
                        <div><p class="apsc-eyebrow"><?php echo esc_html__('Maintenance', 'ap-sitecare'); ?></p><h2><?php echo esc_html__('Updates', 'ap-sitecare'); ?></h2></div>
                        <span class="apsc-badge apsc-badge--<?php echo esc_attr(($view_data['updates']['core_update_available'] || $view_data['updates']['plugin_update_count'] > 0 || $view_data['updates']['theme_update_count'] > 0) ? 'attention' : 'success'); ?>">
                            <?php echo esc_html(($view_data['updates']['core_update_available'] || $view_data['updates']['plugin_update_count'] > 0 || $view_data['updates']['theme_update_count'] > 0) ? __('Updates available', 'ap-sitecare') : __('Up to date', 'ap-sitecare')); ?>
                        </span>
                    </div>
                    <div class="apsc-stat-grid">
                        <div class="apsc-stat"><span><?php echo esc_html__('WordPress core', 'ap-sitecare'); ?></span><strong><?php echo esc_html($view_data['updates']['core_update_available'] ? __('Update available', 'ap-sitecare') : __('Up to date', 'ap-sitecare')); ?></strong><small><?php echo esc_html(sprintf(__('Version %s', 'ap-sitecare'), $view_data['updates']['wordpress_version'])); ?></small></div>
                        <div class="apsc-stat"><span><?php echo esc_html__('Plugin updates', 'ap-sitecare'); ?></span><strong><?php echo esc_html((string) $view_data['updates']['plugin_update_count']); ?></strong><small><?php echo esc_html__('Currently available', 'ap-sitecare'); ?></small></div>
                        <div class="apsc-stat"><span><?php echo esc_html__('Theme updates', 'ap-sitecare'); ?></span><strong><?php echo esc_html((string) $view_data['updates']['theme_update_count']); ?></strong><small><?php echo esc_html($value_or_unknown($view_data['updates']['active_theme'])); ?></small></div>
                    </div>
                    <p class="apsc-card__footer"><?php echo esc_html(sprintf(__('Last WordPress update check: %s', 'ap-sitecare'), $format_date($view_data['updates']['last_checked_at']))); ?></p>
                </section>
            <?php endif; ?>

            <section class="apsc-card">
                <div class="apsc-section-heading">
                    <div><p class="apsc-eyebrow"><?php echo esc_html__('Care history', 'ap-sitecare'); ?></p><h2><?php echo esc_html__('Recent Activity', 'ap-sitecare'); ?></h2></div>
                </div>
                <?php if ($view_data['recent_activity'] === array()) : ?>
                    <div class="apsc-empty"><strong><?php echo esc_html__('Activity will appear here soon.', 'ap-sitecare'); ?></strong><p><?php echo esc_html__('AP SiteCare will show verified maintenance and protection events as they become available.', 'ap-sitecare'); ?></p></div>
                <?php else : ?>
                    <ol class="apsc-activity-list">
                        <?php foreach ($view_data['recent_activity'] as $activity) : ?>
                            <li><span class="apsc-activity-list__dot" aria-hidden="true"></span><div><strong><?php echo esc_html(isset($activity['label']) ? (string) $activity['label'] : __('Care activity recorded', 'ap-sitecare')); ?></strong><time><?php echo esc_html($format_date($activity['createdAt'] ?? null)); ?></time></div></li>
                        <?php endforeach; ?>
                    </ol>
                <?php endif; ?>
            </section>
        </main>

        <aside class="apsc-side-column">
            <?php if ($settings['show_security']) : ?>
                <section class="apsc-card">
                    <div class="apsc-section-heading"><div><p class="apsc-eyebrow"><?php echo esc_html__('Protection', 'ap-sitecare'); ?></p><h2><?php echo esc_html__('Security Activity', 'ap-sitecare'); ?></h2></div><span class="apsc-badge apsc-badge--unknown"><?php echo esc_html(ucfirst((string) ($view_data['security']['status'] ?? 'unknown'))); ?></span></div>
                    <dl class="apsc-metric-list">
                        <div><dt><?php echo esc_html__('Threats blocked this month', 'ap-sitecare'); ?></dt><dd><?php echo esc_html($value_or_unknown($view_data['security']['threatsBlockedThisMonth'] ?? null)); ?></dd></div>
                        <div><dt><?php echo esc_html__('Login attempts blocked', 'ap-sitecare'); ?></dt><dd><?php echo esc_html($value_or_unknown($view_data['security']['loginAttemptsBlocked'] ?? null)); ?></dd></div>
                        <div><dt><?php echo esc_html__('Suspicious requests blocked', 'ap-sitecare'); ?></dt><dd><?php echo esc_html($value_or_unknown($view_data['security']['suspiciousRequestsBlocked'] ?? null)); ?></dd></div>
                        <div><dt><?php echo esc_html__('Last security check', 'ap-sitecare'); ?></dt><dd><?php echo esc_html($format_date($view_data['security']['lastCheckedAt'] ?? null)); ?></dd></div>
                    </dl>
                </section>
            <?php endif; ?>

            <?php if ($settings['show_backups']) : ?>
                <section class="apsc-card">
                    <div class="apsc-section-heading"><div><p class="apsc-eyebrow"><?php echo esc_html__('Recovery', 'ap-sitecare'); ?></p><h2><?php echo esc_html__('Backups', 'ap-sitecare'); ?></h2></div><span class="apsc-badge apsc-badge--unknown"><?php echo esc_html(ucfirst((string) ($view_data['backups']['status'] ?? 'unknown'))); ?></span></div>
                    <dl class="apsc-metric-list">
                        <div><dt><?php echo esc_html__('Last daily backup', 'ap-sitecare'); ?></dt><dd><?php echo esc_html($format_date($view_data['backups']['lastDailyBackupAt'] ?? null)); ?></dd></div>
                        <div><dt><?php echo esc_html__('Last offsite archive', 'ap-sitecare'); ?></dt><dd><?php echo esc_html($format_date($view_data['backups']['lastOffsiteArchiveAt'] ?? null)); ?></dd></div>
                        <div><dt><?php echo esc_html__('Retention', 'ap-sitecare'); ?></dt><dd><?php echo esc_html($value_or_unknown($view_data['backups']['retentionNote'] ?? null)); ?></dd></div>
                    </dl>
                </section>
            <?php endif; ?>

            <?php if ($settings['show_uptime']) : ?>
                <section class="apsc-card">
                    <div class="apsc-section-heading"><div><p class="apsc-eyebrow"><?php echo esc_html__('Availability', 'ap-sitecare'); ?></p><h2><?php echo esc_html__('Uptime', 'ap-sitecare'); ?></h2></div><span class="apsc-badge apsc-badge--unknown"><?php echo esc_html(ucfirst((string) ($view_data['uptime']['status'] ?? 'unknown'))); ?></span></div>
                    <dl class="apsc-metric-list">
                        <div><dt><?php echo esc_html__('30-day uptime', 'ap-sitecare'); ?></dt><dd><?php echo esc_html(($view_data['uptime']['thirtyDayPercentage'] ?? null) === null ? __('Not available yet', 'ap-sitecare') : ((string) $view_data['uptime']['thirtyDayPercentage']) . '%'); ?></dd></div>
                        <div><dt><?php echo esc_html__('Last uptime check', 'ap-sitecare'); ?></dt><dd><?php echo esc_html($format_date($view_data['uptime']['lastCheckedAt'] ?? null)); ?></dd></div>
                    </dl>
                </section>
            <?php endif; ?>

            <?php if ($settings['show_service_time'] && ($view_data['plan_label'] !== '' || $view_data['service_time'] !== null)) : ?>
                <section class="apsc-card">
                    <div class="apsc-section-heading"><div><p class="apsc-eyebrow"><?php echo esc_html__('Your plan', 'ap-sitecare'); ?></p><h2><?php echo esc_html($view_data['plan_label'] !== '' ? $view_data['plan_label'] : __('Service Time', 'ap-sitecare')); ?></h2></div></div>
                    <?php if ($view_data['service_time'] === null) : ?>
                        <div class="apsc-empty"><strong><?php echo esc_html__('Service-time details are not available yet.', 'ap-sitecare'); ?></strong><p><?php echo esc_html__('This section is ready to display plan usage when connected data becomes available.', 'ap-sitecare'); ?></p></div>
                    <?php else : ?>
                        <dl class="apsc-metric-list">
                            <div><dt><?php echo esc_html__('Monthly service time', 'ap-sitecare'); ?></dt><dd><?php echo esc_html($value_or_unknown($view_data['service_time']['monthlyTime'] ?? null)); ?></dd></div>
                            <div><dt><?php echo esc_html__('Used time', 'ap-sitecare'); ?></dt><dd><?php echo esc_html($value_or_unknown($view_data['service_time']['usedTime'] ?? null)); ?></dd></div>
                            <div><dt><?php echo esc_html__('Remaining time', 'ap-sitecare'); ?></dt><dd><?php echo esc_html($value_or_unknown($view_data['service_time']['remainingTime'] ?? null)); ?></dd></div>
                            <div><dt><?php echo esc_html__('Accumulated time', 'ap-sitecare'); ?></dt><dd><?php echo esc_html($value_or_unknown($view_data['service_time']['accumulatedTime'] ?? null)); ?></dd></div>
                        </dl>
                    <?php endif; ?>
                </section>
            <?php endif; ?>
        </aside>
    </div>

    <p class="apsc-cache-note">
        <?php echo esc_html(sprintf(__('Latest dashboard summary cached: %s', 'ap-sitecare'), $format_date($view_data['cache_fetched_at']))); ?>
        <?php if ($view_data['cache_is_stale']) : ?> <?php echo esc_html__('Current dashboard metrics are unavailable until the next successful refresh.', 'ap-sitecare'); ?><?php endif; ?>
    </p>
</div>
