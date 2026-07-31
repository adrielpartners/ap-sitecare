=== AP SiteCare ===
Contributors: adrielpartners
Requires at least: 6.0
Requires PHP: 8.0
Stable tag: 0.3.0

Securely reports WordPress operational health and provides a client-facing care summary inside WordPress Admin.

== Installation ==

1. Upload and activate the plugin.
2. Open AP SiteCare > Settings.
3. Enter the dashboard URL, Site ID, and Site Secret issued by AP SiteCare.
4. Save settings and test the connection.

Version 0.3 adds detailed core, theme, and plugin inventory, update activity
reconciliation, a signed observation-only refresh endpoint, and automatic
credential rotation with a fallback overlap. Existing Site ID and Site Secret
settings remain compatible during upgrade.

The plugin requires WordPress 6.0 or newer and PHP 8.0 or newer. Upgrade the
Dashboard and run its PostgreSQL migration 10 before deploying plugin 0.3.0.
Do not clear the existing connection settings during upgrade: the first
successful check-in negotiates the new rotation lifecycle automatically.

License and support status remain "unknown" when a plugin vendor does not
publish safe metadata. Integrations may supply non-secret license status with
the `apsc_plugin_license_status` filter. Never return license keys or account
credentials through that filter.

== Client Care View ==

The AP SiteCare screen and WordPress Dashboard widget combine immediate local
WordPress update information with the latest cached, client-safe summary from
the AP SiteCare dashboard. Unavailable metrics remain clearly marked as not
available.
