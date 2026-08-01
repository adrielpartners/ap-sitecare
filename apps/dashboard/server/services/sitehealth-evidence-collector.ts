import { randomUUID } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import type {
  SiteHealthCheckup,
  SiteHealthEvidence,
  SiteHealthFinding,
  SiteHealthRecommendation
} from '../domain/sitehealth'
import { PageSpeedClient, type PageSpeedResult } from '../integrations/pagespeed-client'
import { BackupRepository } from '../repositories/backup-repository'
import { CheckInRepository } from '../repositories/check-in-repository'
import { CloudflareRepository } from '../repositories/cloudflare-repository'
import { HostingerRepository } from '../repositories/hostinger-repository'
import { WordPressUpdateRepository } from '../repositories/wordpress-update-repository'
import type { QueryExecutor, TransactionalQueryExecutor } from '../utils/database'
import type { NormalizedPluginSiteHealthEvidence } from './sitehealth-plugin-evidence'

export interface CollectedSiteHealthData {
  evidenceCheckInId: string | null
  evidence: SiteHealthEvidence[]
  findings: SiteHealthFinding[]
  recommendations: SiteHealthRecommendation[]
}

export class SiteHealthEvidenceCollector {
  constructor(
    private readonly database: QueryExecutor | TransactionalQueryExecutor,
    private readonly pagespeed: PageSpeedClient
  ) {}

  async collect(checkup: SiteHealthCheckup, site: { id: string, url: string }): Promise<CollectedSiteHealthData> {
    const now = new Date().toISOString()
    const evidence: SiteHealthEvidence[] = []
    const add = (
      area: SiteHealthEvidence['area'],
      metricKey: string,
      source: string,
      availability: SiteHealthEvidence['availability'],
      summary: string,
      value: Record<string, unknown> = {},
      observedAt: string | null = now
    ): SiteHealthEvidence => {
      const item: SiteHealthEvidence = {
        id: randomUUID(), checkupId: checkup.id, siteId: site.id, area,
        metricKey, source, availability, summary, value, observedAt, createdAt: now
      }
      evidence.push(item)
      return item
    }

    const [desktop, mobile] = await Promise.allSettled([
      this.pagespeed.analyze(site.url, 'desktop'),
      this.pagespeed.analyze(site.url, 'mobile')
    ])
    const desktopEvidence = addPageSpeed(add, 'desktop', desktop)
    const mobileEvidence = addPageSpeed(add, 'mobile', mobile)

    const checkInRepository = new CheckInRepository(this.database)
    const latestCheckIn = await checkInRepository.findLatestCheckIn(site.id)
    const pluginEvidence = normalizedPluginEvidence(latestCheckIn?.payload.siteHealthEvidence)
    if (pluginEvidence) {
      addPluginEvidence(add, pluginEvidence)
    } else {
      for (const [area, key] of [
        ['content', 'wordpress.content'], ['media', 'wordpress.media'],
        ['users', 'wordpress.users'], ['environment', 'wordpress.environment'],
        ['database', 'wordpress.database']
      ] as const) {
        add(area, key, 'wordpress-plugin', 'unavailable', 'AP SiteCare plugin 0.4 check-in evidence has not been received.', {}, latestCheckIn?.receivedAt ?? null)
      }
    }

    const updates = new WordPressUpdateRepository(this.database)
    const snapshot = await updates.findLatestSnapshot(site.id)
    if (snapshot) {
      const inventory = await updates.listInventory(snapshot.id)
      add('updates', 'wordpress.updates', 'wordpress-plugin', 'available',
        `${snapshot.pendingUpdateCount} WordPress updates pending; checked ${snapshot.checkedAt}.`,
        { snapshot, inventory }, snapshot.checkedAt)
      add('plugins-themes', 'wordpress.plugins-themes', 'wordpress-plugin', 'available',
        `${snapshot.pluginCount} plugins and ${snapshot.themeCount} themes inventoried.`,
        { inventory }, snapshot.checkedAt)
    } else {
      add('updates', 'wordpress.updates', 'wordpress-plugin', 'unavailable', 'No WordPress update inventory has been received.', {}, latestCheckIn?.receivedAt ?? null)
      add('plugins-themes', 'wordpress.plugins-themes', 'wordpress-plugin', 'unavailable', 'No plugin or theme inventory has been received.', {}, latestCheckIn?.receivedAt ?? null)
    }

    const hostinger = await new HostingerRepository(this.database).findBySiteId(site.id)
    if (hostinger?.latestDailyBackupAt) {
      add('backups', 'hostinger.daily-backup', 'hostinger-api', 'available',
        `Latest Hostinger daily backup reported ${hostinger.latestDailyBackupAt}.`,
        { latestSuccessfulAt: hostinger.latestDailyBackupAt, providerMessage: hostinger.dailyBackupMessage },
        hostinger.lastSyncedAt)
    } else {
      add('backups', 'hostinger.daily-backup', 'hostinger-api', 'unavailable',
        hostinger?.dailyBackupMessage ?? 'Hostinger daily-backup timing is not available for this shared-hosting account.',
        { providerAvailability: hostinger?.dailyBackupAvailability ?? 'not-synchronized' }, hostinger?.lastSyncedAt ?? null)
    }
    const artifacts = await new BackupRepository(this.database).listArtifacts(site.id)
    const latestSuccess = artifacts.find(artifact => artifact.status === 'completed')
    const latestFailure = artifacts.find(artifact => artifact.status === 'failed')
    if (latestSuccess || latestFailure) {
      add('backups', 'sitecare.long-term-backup', 'sitecare-dashboard', 'available',
        latestSuccess ? `Latest successful SiteCare backup completed ${latestSuccess.completedAt ?? latestSuccess.startedAt}.` : 'No successful SiteCare long-term backup is recorded.',
        {
          latestSuccess: latestSuccess ? { id: latestSuccess.id, startedAt: latestSuccess.startedAt, completedAt: latestSuccess.completedAt, expiresAt: latestSuccess.expiresAt } : null,
          latestFailure: latestFailure ? { id: latestFailure.id, startedAt: latestFailure.startedAt, errorMessage: latestFailure.errorMessage } : null
        }, latestSuccess?.completedAt ?? latestFailure?.startedAt ?? null)
    } else {
      add('backups', 'sitecare.long-term-backup', 'sitecare-dashboard', 'unavailable', 'No SiteCare long-term backup run is recorded for this site.', {}, null)
    }

    const security = await new CloudflareRepository(this.database).listEffectiveSecurityEvidence(site.id)
    const ssl = effectiveControl(security, 'universal-ssl')
    if (ssl) {
      add('environment', 'cloudflare.universal-ssl', ssl.source, 'available', ssl.summary,
        { status: ssl.status, notes: ssl.notes }, ssl.observedAt)
    } else {
      add('environment', 'cloudflare.universal-ssl', 'cloudflare-api', 'unavailable', 'Universal SSL evidence has not been synchronized.', {}, null)
    }

    if (checkup.includeBrokenLinks) {
      try {
        const result = await checkHomepageLinks(site.url)
        add('content', 'content.broken-links', 'sitecare-dashboard', 'available',
          `${result.checkedCount} same-site homepage links checked; ${result.broken.length} need review.`, result, now)
      } catch (error) {
        add('content', 'content.broken-links', 'sitecare-dashboard', 'error', safeError(error), {}, now)
      }
    } else {
      add('content', 'content.broken-links', 'sitecare-dashboard', 'unavailable', 'Optional broken-link checking was not requested for this Checkup.', {}, null)
    }

    const findings = deriveFindings(checkup, evidence, desktopEvidence, mobileEvidence, pluginEvidence, snapshot ? await updates.listInventory(snapshot.id) : [], now)
    const recommendations = deriveRecommendations(checkup, findings, evidence, now)
    return { evidenceCheckInId: latestCheckIn?.id ?? null, evidence, findings, recommendations }
  }
}

type AddEvidence = (
  area: SiteHealthEvidence['area'], metricKey: string, source: string,
  availability: SiteHealthEvidence['availability'], summary: string,
  value?: Record<string, unknown>, observedAt?: string | null
) => SiteHealthEvidence

function addPageSpeed(
  add: AddEvidence,
  strategy: 'desktop' | 'mobile',
  result: PromiseSettledResult<PageSpeedResult>
): SiteHealthEvidence {
  if (result.status === 'fulfilled') {
    const score = result.value.performanceScore
    const fieldAvailable = Object.values(result.value.coreWebVitals).some(metric => metric.percentile !== null)
    return add('performance', `pagespeed.${strategy}`, 'google-pagespeed-insights', 'available',
      `${strategy === 'desktop' ? 'Desktop' : 'Mobile'} PageSpeed score: ${score ?? 'not scored'}${fieldAvailable ? '; Core Web Vitals field data available.' : '; Core Web Vitals field data unavailable.'}`,
      result.value as unknown as Record<string, unknown>, result.value.analyzedAt)
  }
  return add('performance', `pagespeed.${strategy}`, 'google-pagespeed-insights', 'error', safeError(result.reason), {}, new Date().toISOString())
}

function addPluginEvidence(add: AddEvidence, plugin: NormalizedPluginSiteHealthEvidence): void {
  add('content', 'wordpress.content', 'wordpress-plugin', 'available',
    `${plugin.content.publishedPageCount} published pages; ${plugin.content.pages.length} included for review.`, plugin.content, plugin.collectedAt)
  add('media', 'wordpress.media', 'wordpress-plugin', 'available',
    `${plugin.media.attachmentCount} media items; ${plugin.media.largeImages.length} large images and ${plugin.media.unusedCandidates.length} unattached candidates.`, plugin.media, plugin.collectedAt)
  add('users', 'wordpress.users', 'wordpress-plugin', 'available',
    `${plugin.users.userCount} WordPress users; last-login activity is not natively available.`, plugin.users, plugin.collectedAt)
  add('environment', 'wordpress.environment', 'wordpress-plugin', 'available',
    `WordPress ${plugin.environment.wordpressVersion}; PHP ${plugin.environment.phpVersion}; HTTPS ${plugin.environment.homeUsesHttps ? 'enabled' : 'not enabled'}.`, plugin.environment, plugin.collectedAt)
  add('database', 'wordpress.database', 'wordpress-plugin', 'available',
    `Database size ${formatBytes(plugin.database.sizeBytes)}; ${plugin.database.revisionCount ?? 'unknown'} revisions and ${plugin.database.expiredTransientCount ?? 'unknown'} expired transients.`, plugin.database, plugin.collectedAt)
  add('environment', 'wordpress.collection-limitations', 'wordpress-plugin', 'available',
    `${plugin.limitations.length} collection limitations documented.`, { limitations: plugin.limitations }, plugin.collectedAt)
}

function deriveFindings(
  checkup: SiteHealthCheckup,
  evidence: SiteHealthEvidence[],
  desktop: SiteHealthEvidence,
  mobile: SiteHealthEvidence,
  plugin: NormalizedPluginSiteHealthEvidence | null,
  inventory: Array<{ componentType: string, active: boolean, supportStatus: string, premiumLicenseStatus: string, name: string, availableVersion: string | null }>,
  now: string
): SiteHealthFinding[] {
  const findings: SiteHealthFinding[] = []
  const add = (area: SiteHealthFinding['area'], title: string, description: string, severity: SiteHealthFinding['severity'], evidenceId: string | null) => {
    findings.push({
      id: randomUUID(), checkupId: checkup.id, siteId: checkup.siteId, evidenceId,
      area, title, description, severity, origin: 'automated', status: 'active',
      technicianNotes: null, sortOrder: findings.length, createdBy: 'system:sitehealth', createdAt: now, updatedAt: now
    })
  }

  for (const item of [desktop, mobile]) {
    const score = item.availability === 'available' && typeof item.value.performanceScore === 'number'
      ? item.value.performanceScore : null
    if (score !== null && score < 90) add('performance', `${capitalize(String(item.value.strategy))} performance needs review`,
      `PageSpeed reported ${score}/100. Review the recorded Lighthouse opportunities before making changes.`, score < 50 ? 'high' : 'medium', item.id)
  }

  if (plugin) {
    const twoYearsAgo = Date.now() - 2 * 365 * 24 * 60 * 60 * 1000
    const oldPages = plugin.content.pages.filter(page => page.modifiedAt && Date.parse(page.modifiedAt) < twoYearsAgo)
    const thinPages = plugin.content.pages.filter(page => page.wordCount < 300)
    if (oldPages.length) add('content', 'Older content needs editorial review', `${oldPages.length} published pages have not been modified in more than two years. Age alone does not mean they should be removed.`, 'low', findEvidence(evidence, 'wordpress.content'))
    if (thinPages.length) add('content', 'Possible content consolidation opportunities', `${thinPages.length} pages contain fewer than 300 words. Review purpose, traffic, and search value before consolidating.`, 'info', findEvidence(evidence, 'wordpress.content'))
    if (plugin.media.largeImages.length) add('media', 'Large images detected', `${plugin.media.largeImages.length} images are at least 1 MB.`, 'medium', findEvidence(evidence, 'wordpress.media'))
    if (plugin.media.unusedCandidates.length) add('media', 'Unattached media needs review', `${plugin.media.unusedCandidates.length} files are unattached candidates. Unattached does not prove unused.`, 'low', findEvidence(evidence, 'wordpress.media'))
    const admins = plugin.users.accounts.filter(user => user.roles.includes('administrator'))
    const oldAdmins = admins.filter(user => user.registeredAt && Date.parse(user.registeredAt) < twoYearsAgo)
    if (oldAdmins.length) add('users', 'Long-standing administrator accounts need review', `${oldAdmins.length} administrator accounts are more than two years old. Confirm access is still appropriate; inactivity cannot be determined automatically.`, 'medium', findEvidence(evidence, 'wordpress.users'))
    if (!plugin.environment.homeUsesHttps) add('environment', 'WordPress home URL is not HTTPS', 'The configured WordPress home URL does not use HTTPS.', 'high', findEvidence(evidence, 'wordpress.environment'))
    if ((plugin.database.revisionCount ?? 0) > 100) add('database', 'Post revisions may be cleaned up', `${plugin.database.revisionCount} revisions are stored.`, 'low', findEvidence(evidence, 'wordpress.database'))
    if ((plugin.database.expiredTransientCount ?? 0) > 0) add('database', 'Expired transients are present', `${plugin.database.expiredTransientCount} expired transient timeout records were detected.`, 'low', findEvidence(evidence, 'wordpress.database'))
    if ((plugin.database.autoloadBytes ?? 0) > 1_000_000) add('database', 'Autoloaded options need review', `${formatBytes(plugin.database.autoloadBytes)} of autoloaded options were detected.`, 'medium', findEvidence(evidence, 'wordpress.database'))
  }

  const inactivePlugins = inventory.filter(item => item.componentType === 'plugin' && !item.active)
  const inactiveThemes = inventory.filter(item => item.componentType === 'theme' && !item.active)
  const abandoned = inventory.filter(item => item.supportStatus === 'possibly-abandoned')
  const inactiveLicenses = inventory.filter(item => item.premiumLicenseStatus === 'inactive')
  if (inactivePlugins.length) add('plugins-themes', 'Inactive plugins installed', `${inactivePlugins.length} inactive plugins should be reviewed before removal.`, 'low', findEvidence(evidence, 'wordpress.plugins-themes'))
  if (inactiveThemes.length) add('plugins-themes', 'Inactive themes installed', `${inactiveThemes.length} inactive themes should be reviewed before removal.`, 'low', findEvidence(evidence, 'wordpress.plugins-themes'))
  if (abandoned.length) add('plugins-themes', 'Possibly abandoned software detected', `${abandoned.length} plugins or themes have stale support metadata. Confirm vendor support manually.`, 'high', findEvidence(evidence, 'wordpress.plugins-themes'))
  if (inactiveLicenses.length) add('plugins-themes', 'Inactive premium licenses detected', `${inactiveLicenses.length} components report an inactive premium license.`, 'high', findEvidence(evidence, 'wordpress.plugins-themes'))

  const updateEvidence = evidence.find(item => item.metricKey === 'wordpress.updates')
  const snapshot = updateEvidence?.value.snapshot as Record<string, unknown> | undefined
  if (snapshot && Number(snapshot.pendingUpdateCount) > 0) add('updates', 'WordPress updates are pending', `${Number(snapshot.pendingUpdateCount)} core, plugin, or theme updates are available.`, 'medium', updateEvidence?.id ?? null)
  const daily = evidence.find(item => item.metricKey === 'hostinger.daily-backup')
  if (daily?.availability === 'unavailable') add('backups', 'Hostinger daily-backup timing unavailable', daily.summary, 'info', daily.id)
  return findings
}

function deriveRecommendations(checkup: SiteHealthCheckup, findings: SiteHealthFinding[], evidence: SiteHealthEvidence[], now: string): SiteHealthRecommendation[] {
  const recommendations: SiteHealthRecommendation[] = []
  const add = (area: SiteHealthRecommendation['area'], actionType: SiteHealthRecommendation['actionType'], title: string, description: string, priority: SiteHealthRecommendation['priority']) => {
    if (recommendations.some(item => item.actionType === actionType && item.title === title)) return
    recommendations.push({
      id: randomUUID(), checkupId: checkup.id, siteId: checkup.siteId, area, actionType,
      title, description, priority, status: 'proposed', createdBy: 'system:sitehealth', createdAt: now, updatedAt: now
    })
  }
  for (const finding of findings) {
    if (finding.title === 'Large images detected') add('media', 'compress-images', 'Compress or convert large images', 'Review the listed large JPEG/PNG files and safely compress them or convert appropriate files to WebP.', 'medium')
    if (finding.title === 'Unattached media needs review') add('media', 'review-orphaned-media', 'Review orphaned media candidates', 'Confirm each candidate is unused before removing any media file.', 'low')
    if (finding.title === 'Inactive plugins installed') add('plugins-themes', 'remove-unused-plugin', 'Remove approved unused plugins', 'Confirm each inactive plugin is unnecessary, then remove only the approved items.', 'low')
    if (finding.title === 'Inactive themes installed') add('plugins-themes', 'remove-unused-theme', 'Remove approved unused themes', 'Keep the active theme and a suitable fallback; remove only approved unused themes.', 'low')
    if (finding.title === 'Post revisions may be cleaned up') add('database', 'clear-revisions', 'Clear approved excess revisions', 'Verify a current backup, then remove approved excess revisions.', 'low')
    if (finding.title === 'Expired transients are present') add('database', 'clear-expired-transients', 'Clear expired transients', 'Verify a current backup, then clear expired transients.', 'low')
    if (finding.area === 'updates') add('updates', 'verify-updates', 'Verify and apply approved updates', 'Review update compatibility and backup status before applying updates.', 'medium')
    if (finding.area === 'performance') add('performance', 'manual-maintenance', 'Review performance opportunities', 'Review PageSpeed evidence and propose a scoped performance improvement plan.', finding.severity === 'high' ? 'high' : 'medium')
    if (finding.area === 'users') add('users', 'manual-maintenance', 'Review WordPress access', 'Confirm administrator and user access manually before changing any account.', 'medium')
    if (finding.title === 'Older content needs editorial review' || finding.title === 'Possible content consolidation opportunities') add('content', 'manual-maintenance', 'Review content recommendations', 'Review page purpose, analytics, search value, and client goals before consolidating or removing content.', 'low')
    if (finding.title === 'Possibly abandoned software detected' || finding.title === 'Inactive premium licenses detected') add('plugins-themes', 'manual-maintenance', 'Resolve plugin and theme support risks', 'Confirm current vendor support and license status, then propose replacements or renewals where needed.', 'high')
  }
  const backup = evidence.find(item => item.metricKey === 'sitecare.long-term-backup' && item.availability === 'available')
  if (backup) add('backups', 'verify-backups', 'Verify current backup status', 'Confirm the latest relevant backup is complete and usable before approved cleanup begins.', 'medium')
  return recommendations
}

function normalizedPluginEvidence(value: unknown): NormalizedPluginSiteHealthEvidence | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as NormalizedPluginSiteHealthEvidence
    : null
}

function effectiveControl(evidence: Awaited<ReturnType<CloudflareRepository['listEffectiveSecurityEvidence']>>, key: string) {
  return evidence.filter(item => item.controlKey === key)
    .sort((left, right) => Number(right.source === 'technician') - Number(left.source === 'technician'))[0] ?? null
}

function findEvidence(evidence: SiteHealthEvidence[], key: string): string | null {
  return evidence.find(item => item.metricKey === key)?.id ?? null
}

function capitalize(value: string): string { return value.charAt(0).toUpperCase() + value.slice(1) }
function formatBytes(value: number | null): string {
  if (value === null) return 'unavailable'
  if (value < 1024) return `${value} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let size = value / 1024
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1 }
  return `${size.toFixed(1)} ${units[unit]}`
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : 'Evidence collection failed.')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]').slice(0, 500)
}

async function checkHomepageLinks(siteUrl: string): Promise<{ checkedCount: number, broken: Array<{ url: string, status: number | null, error: string | null }> }> {
  const origin = new URL(siteUrl)
  if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('Broken-link checking requires an HTTP or HTTPS site URL.')
  const homepageResult = await fetchPublicUrl(origin, 15_000)
  const homepage = homepageResult.response
  if (!homepage.ok) throw new Error(`Homepage returned HTTP ${homepage.status}; link checking could not start.`)
  const html = (await homepage.text()).slice(0, 2_000_000)
  const effectiveOrigin = new URL(homepageResult.finalUrl).origin
  const urls = [...html.matchAll(/href=["']([^"'#]+)["']/gi)]
    .map(match => {
      try { return new URL(match[1]!, homepageResult.finalUrl) } catch { return null }
    })
    .filter((url): url is URL => Boolean(url) && ['http:', 'https:'].includes(url!.protocol) && url!.origin === effectiveOrigin)
    .filter((url, index, values) => values.findIndex(candidate => candidate.href === url.href) === index)
    .slice(0, 25)
  const results = await Promise.all(urls.map(async url => {
    try {
      const { response } = await fetchPublicUrl(url, 10_000)
      return response.ok ? null : { url: url.href, status: response.status, error: null }
    } catch (error) {
      return { url: url.href, status: null, error: safeError(error) }
    }
  }))
  return { checkedCount: urls.length, broken: results.filter((item): item is NonNullable<typeof item> => item !== null) }
}

async function fetchPublicUrl(input: URL, timeoutMs: number): Promise<{ response: Response, finalUrl: string }> {
  let current = new URL(input)
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    if (!['http:', 'https:'].includes(current.protocol)) throw new Error('Only HTTP and HTTPS redirects are allowed.')
    await assertPublicHostname(current.hostname)
    const response = await fetch(current, {
      redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'text/html,*/*' }
    })
    if (response.status < 300 || response.status >= 400) return { response, finalUrl: current.toString() }
    const location = response.headers.get('location')
    if (!location) return { response, finalUrl: current.toString() }
    current = new URL(location, current)
  }
  throw new Error('Redirect limit exceeded while checking links.')
}

async function assertPublicHostname(hostname: string): Promise<void> {
  const normalized = hostname.toLowerCase().replace(/\.$/, '')
  if (normalized === 'localhost' || normalized.endsWith('.localhost') || normalized.endsWith('.local')) {
    throw new Error('Broken-link checking is not allowed for local hostnames.')
  }
  const addresses = isIP(normalized)
    ? [{ address: normalized }]
    : await lookup(normalized, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(entry => isPrivateAddress(entry.address))) {
    throw new Error('Broken-link checking is not allowed for private or unresolved network addresses.')
  }
}

function isPrivateAddress(address: string): boolean {
  const value = address.toLowerCase()
  if (value === '::1' || value === '::' || value.startsWith('fe80:') || value.startsWith('fc') || value.startsWith('fd')) return true
  const mapped = value.startsWith('::ffff:') ? value.slice(7) : value
  const parts = mapped.split('.').map(Number)
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part))) return false
  const [first, second] = parts
  return first === 0 || first === 10 || first === 127 || first >= 224
    || (first === 169 && second === 254)
    || (first === 172 && second! >= 16 && second! <= 31)
    || (first === 192 && second === 168)
    || (first === 100 && second! >= 64 && second! <= 127)
}
