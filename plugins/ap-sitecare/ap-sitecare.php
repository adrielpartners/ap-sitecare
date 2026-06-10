<?php
/**
 * Plugin Name: AP SiteCare
 * Description: Reports WordPress operational health and provides client care visibility.
 * Version: 0.2.0
 * Author: Adriel Partners
 * Requires at least: 6.0
 * Requires PHP: 8.0
 */

defined('ABSPATH') || exit;

define('APSC_PLUGIN_FILE', __FILE__);
define('APSC_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('APSC_PLUGIN_VERSION', '0.2.0');

require_once APSC_PLUGIN_DIR . 'src/SettingsRepository.php';
require_once APSC_PLUGIN_DIR . 'src/DataCollectorService.php';
require_once APSC_PLUGIN_DIR . 'src/ApiClientService.php';
require_once APSC_PLUGIN_DIR . 'src/ReporterService.php';
require_once APSC_PLUGIN_DIR . 'src/ClientSummaryRepository.php';
require_once APSC_PLUGIN_DIR . 'src/ClientCareService.php';
require_once APSC_PLUGIN_DIR . 'src/AdminController.php';
require_once APSC_PLUGIN_DIR . 'src/ClientAdminController.php';
require_once APSC_PLUGIN_DIR . 'src/CronController.php';

use APSiteCare\AdminController;
use APSiteCare\ApiClientService;
use APSiteCare\ClientAdminController;
use APSiteCare\ClientCareService;
use APSiteCare\ClientSummaryRepository;
use APSiteCare\CronController;
use APSiteCare\DataCollectorService;
use APSiteCare\ReporterService;
use APSiteCare\SettingsRepository;

$apsc_settings = new SettingsRepository();
$apsc_collector = new DataCollectorService($apsc_settings);
$apsc_api_client = new ApiClientService();
$apsc_reporter = new ReporterService(
    $apsc_settings,
    $apsc_collector,
    $apsc_api_client
);
$apsc_client_care = new ClientCareService(
    $apsc_settings,
    $apsc_collector,
    $apsc_api_client,
    new ClientSummaryRepository()
);

(new ClientAdminController($apsc_settings, $apsc_client_care))->register_hooks();
(new AdminController($apsc_settings, $apsc_reporter, $apsc_client_care))->register_hooks();
(new CronController($apsc_settings, $apsc_reporter, $apsc_client_care))->register_hooks();

register_activation_hook(__FILE__, array(CronController::class, 'activate'));
register_deactivation_hook(__FILE__, array(CronController::class, 'deactivate'));
