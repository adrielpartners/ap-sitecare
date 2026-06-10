<?php
/**
 * Plugin Name: AP SiteCare Reporter
 * Description: Securely reports WordPress operational health to AP SiteCare.
 * Version: 0.1.0
 * Author: Adriel Partners
 * Requires at least: 6.0
 * Requires PHP: 8.0
 */

defined('ABSPATH') || exit;

define('APSC_PLUGIN_FILE', __FILE__);
define('APSC_PLUGIN_DIR', plugin_dir_path(__FILE__));

require_once APSC_PLUGIN_DIR . 'src/SettingsRepository.php';
require_once APSC_PLUGIN_DIR . 'src/DataCollectorService.php';
require_once APSC_PLUGIN_DIR . 'src/ApiClientService.php';
require_once APSC_PLUGIN_DIR . 'src/ReporterService.php';
require_once APSC_PLUGIN_DIR . 'src/AdminController.php';
require_once APSC_PLUGIN_DIR . 'src/CronController.php';

use APSiteCare\AdminController;
use APSiteCare\ApiClientService;
use APSiteCare\CronController;
use APSiteCare\DataCollectorService;
use APSiteCare\ReporterService;
use APSiteCare\SettingsRepository;

$apsc_settings = new SettingsRepository();
$apsc_reporter = new ReporterService(
    $apsc_settings,
    new DataCollectorService($apsc_settings),
    new ApiClientService()
);

(new AdminController($apsc_settings, $apsc_reporter))->register_hooks();
(new CronController($apsc_settings, $apsc_reporter))->register_hooks();

register_activation_hook(__FILE__, array(CronController::class, 'activate'));
register_deactivation_hook(__FILE__, array(CronController::class, 'deactivate'));
