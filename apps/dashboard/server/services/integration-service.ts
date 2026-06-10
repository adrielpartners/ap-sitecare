import { CloudflareClient } from '../integrations/cloudflare-client'
import { DropboxClient } from '../integrations/dropbox-client'
import { HostingerClient } from '../integrations/hostinger-client'
import type { IntegrationProvider, IntegrationResult } from '../integrations/types'
import { SiteService } from './site-service'

export interface IntegrationSettings {
  cloudflareApiToken: string
  dropboxAccessToken: string
  dropboxBackupRoot: string
  hostingerApiBaseUrl: string
  hostingerApiToken: string
}

export class IntegrationService {
  constructor(
    private readonly settings: IntegrationSettings,
    private readonly siteService = new SiteService(),
    private readonly cloudflare = new CloudflareClient(settings.cloudflareApiToken),
    private readonly dropbox = new DropboxClient(settings.dropboxAccessToken, settings.dropboxBackupRoot),
    private readonly hostinger = new HostingerClient(settings.hostingerApiToken, settings.hostingerApiBaseUrl)
  ) {}

  configuration(): Record<IntegrationProvider, boolean> {
    return {
      cloudflare: true,
      dropbox: Boolean(this.settings.dropboxAccessToken && this.settings.dropboxBackupRoot),
      hostinger: Boolean(this.settings.hostingerApiToken && this.settings.hostingerApiBaseUrl)
    }
  }

  async inspect(siteId: string, provider: IntegrationProvider): Promise<IntegrationResult> {
    const site = this.siteService.get(siteId)
    const domain = new URL(site.url).hostname
    if (provider === 'cloudflare') return this.cloudflare.inspect(domain)
    if (provider === 'dropbox') return this.dropbox.inspect(domain)
    if (provider === 'hostinger') return this.hostinger.inspect()
    throw new Error('Unsupported integration provider.')
  }
}
