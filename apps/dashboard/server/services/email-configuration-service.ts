import type { EmailProvider } from '../email/types'
import { BrevoEmailProvider } from '../email/brevo-email-provider'
import {
  emailProviders,
  isEmailProviderName,
  type EmailGlobalSettings,
  type EmailProviderConfiguration,
  type EmailProviderName,
  type NotificationChannelAdapter
} from '../email/notification-types'
import { NotificationRepository, type StoredEmailProviderConfiguration } from '../repositories/notification-repository'
import { decryptSecret, encryptSecret } from '../utils/credential-crypto'
import type { RuntimeSettings } from '../utils/config'
import { AuditService } from './audit-service'

export interface SaveEmailGlobalSettingsInput {
  selectedProvider: EmailProviderName
  fromAddress: string
  fromName: string
  replyTo?: string | null
  branding?: Record<string, unknown>
}

export interface SaveEmailProviderConfigurationInput {
  provider: EmailProviderName
  apiKey?: string | null
  webhookToken?: string | null
  configuration?: Record<string, unknown>
}

export class EmailConfigurationService {
  constructor(
    private readonly runtime: Pick<RuntimeSettings, 'email' | 'credentialEncryptionKey'>,
    private readonly repository = new NotificationRepository(),
    private readonly audit = new AuditService()
  ) {}

  async getSettings(): Promise<{
    global: EmailGlobalSettings
    providers: EmailProviderConfiguration[]
    channels: NotificationChannelAdapter[]
  }> {
    const global = await this.effectiveGlobalSettings()
    const saved = new Map((await this.repository.listProviderConfigurations()).map(item => [item.provider, item]))
    return {
      global,
      providers: emailProviders.map(provider => {
        const configuration = saved.get(provider)
        const runtimeConfigured = provider === 'brevo' && Boolean(this.runtime.email.brevoApiKey)
        return {
          provider,
          apiKeyConfigured: configuration?.apiKeyConfigured || runtimeConfigured,
          webhookTokenConfigured: configuration?.webhookTokenConfigured
            || (provider === 'brevo' && Boolean(this.runtime.email.webhookBearerToken)),
          configuration: configuration?.configuration ?? {},
          operational: provider === 'brevo',
          updatedBy: configuration?.updatedBy ?? null,
          createdAt: configuration?.createdAt ?? null,
          updatedAt: configuration?.updatedAt ?? null
        }
      }),
      channels: [
        { channel: 'email', operational: true },
        { channel: 'telegram', operational: false },
        { channel: 'sms', operational: false }
      ]
    }
  }

  async saveGlobal(input: SaveEmailGlobalSettingsInput, actorIdentifier: string): Promise<EmailGlobalSettings> {
    if (!isEmailProviderName(input.selectedProvider)) throw new Error('Unsupported email provider.')
    if (input.selectedProvider !== 'brevo') {
      throw new Error(`${providerLabel(input.selectedProvider)} configuration is available as a foundation, but only Brevo can be activated in this phase.`)
    }
    const fromAddress = validEmail(input.fromAddress, 'From address')
    const fromName = requiredText(input.fromName, 'From name', 120)
    const replyTo = input.replyTo?.trim() ? validEmail(input.replyTo, 'Reply-To address') : null
    const branding = cleanBranding(input.branding ?? {})
    const existing = await this.repository.findGlobalSettings()
    const now = new Date().toISOString()
    const saved = await this.repository.saveGlobalSettings({
      selectedProvider: input.selectedProvider,
      fromAddress,
      fromName,
      replyTo,
      branding,
      source: 'database',
      updatedBy: actorIdentifier,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    })
    await this.audit.record({
      actorType: 'dashboard-user',
      actorIdentifier,
      eventType: 'email.settings.updated',
      metadata: { selectedProvider: saved.selectedProvider, fromAddress, replyTo }
    })
    return saved
  }

  async saveProvider(
    input: SaveEmailProviderConfigurationInput,
    actorIdentifier: string
  ): Promise<EmailProviderConfiguration> {
    if (!isEmailProviderName(input.provider)) throw new Error('Unsupported email provider.')
    const existing = await this.repository.findProviderConfiguration(input.provider)
    const now = new Date().toISOString()
    const apiKeyCiphertext = input.apiKey?.trim()
      ? encryptSecret(input.apiKey.trim(), this.runtime.credentialEncryptionKey)
      : existing?.apiKeyCiphertext ?? null
    const webhookTokenCiphertext = input.webhookToken?.trim()
      ? encryptSecret(input.webhookToken.trim(), this.runtime.credentialEncryptionKey)
      : existing?.webhookTokenCiphertext ?? null
    const saved = await this.repository.saveProviderConfiguration({
      provider: input.provider,
      apiKeyConfigured: Boolean(apiKeyCiphertext),
      webhookTokenConfigured: Boolean(webhookTokenCiphertext),
      configuration: cleanProviderConfiguration(input.provider, input.configuration ?? existing?.configuration ?? {}),
      operational: input.provider === 'brevo',
      updatedBy: actorIdentifier,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      apiKeyCiphertext,
      webhookTokenCiphertext
    })
    await this.audit.record({
      actorType: 'dashboard-user',
      actorIdentifier,
      eventType: 'email.provider-configuration.updated',
      metadata: {
        provider: input.provider,
        apiKeyConfigured: saved.apiKeyConfigured,
        webhookTokenConfigured: saved.webhookTokenConfigured,
        operational: saved.operational
      }
    })
    return publicProvider(saved)
  }

  async effectiveGlobalSettings(): Promise<EmailGlobalSettings> {
    const saved = await this.repository.findGlobalSettings()
    if (saved) return saved
    return {
      selectedProvider: this.runtime.email.provider || 'brevo',
      fromAddress: this.runtime.email.fromAddress,
      fromName: this.runtime.email.fromName || 'SiteCare',
      replyTo: this.runtime.email.replyTo || null,
      branding: {},
      source: 'runtime',
      updatedBy: null,
      createdAt: null,
      updatedAt: null
    }
  }

  async resolveProvider(provider: EmailProviderName): Promise<EmailProvider> {
    if (provider !== 'brevo') {
      throw new Error(`${providerLabel(provider)} has a saved configuration foundation, but its REST adapter is not operational yet.`)
    }
    const [global, configuration] = await Promise.all([
      this.effectiveGlobalSettings(),
      this.repository.findProviderConfiguration(provider)
    ])
    const apiKey = await this.resolveApiKey(provider, configuration)
    if (!global.fromAddress) throw new Error('The global email From address is not configured.')
    return new BrevoEmailProvider({
      apiKey,
      fromAddress: global.fromAddress,
      fromName: global.fromName,
      replyTo: global.replyTo ?? ''
    })
  }

  async selectedProvider(): Promise<EmailProviderName> {
    return (await this.effectiveGlobalSettings()).selectedProvider
  }

  async verifyWebhookBearerToken(provider: EmailProviderName, supplied: string): Promise<boolean> {
    if (!supplied) return false
    const configuration = await this.repository.findProviderConfiguration(provider)
    const expected = configuration?.webhookTokenCiphertext
      ? decryptSecret(configuration.webhookTokenCiphertext, this.runtime.credentialEncryptionKey)
      : provider === 'brevo' ? this.runtime.email.webhookBearerToken : ''
    if (!expected || expected.length !== supplied.length) return false
    let mismatch = 0
    for (let index = 0; index < expected.length; index += 1) {
      mismatch |= expected.charCodeAt(index) ^ supplied.charCodeAt(index)
    }
    return mismatch === 0
  }

  private async resolveApiKey(
    provider: EmailProviderName,
    configuration: StoredEmailProviderConfiguration | null
  ): Promise<string> {
    if (configuration?.apiKeyCiphertext) {
      return decryptSecret(configuration.apiKeyCiphertext, this.runtime.credentialEncryptionKey)
    }
    if (provider === 'brevo') return this.runtime.email.brevoApiKey
    return ''
  }
}

export function emailRuntimeSettings(settings: RuntimeSettings): Pick<RuntimeSettings, 'email' | 'credentialEncryptionKey'> {
  return { email: settings.email, credentialEncryptionKey: settings.credentialEncryptionKey }
}

function publicProvider(configuration: StoredEmailProviderConfiguration): EmailProviderConfiguration {
  const { apiKeyCiphertext: _apiKey, webhookTokenCiphertext: _webhookToken, ...safe } = configuration
  return safe
}

function providerLabel(provider: EmailProviderName): string {
  return provider === 'sendgrid' ? 'SendGrid' : provider.charAt(0).toUpperCase() + provider.slice(1)
}

function validEmail(value: string, label: string): string {
  const normalized = value.trim().toLowerCase()
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error(`${label} must be a valid email address.`)
  }
  return normalized
}

function requiredText(value: string, label: string, maximum: number): string {
  const normalized = value?.trim()
  if (!normalized) throw new Error(`${label} is required.`)
  if (normalized.length > maximum || /[\r\n]/.test(normalized)) throw new Error(`${label} contains unsupported characters.`)
  return normalized
}

function cleanBranding(input: Record<string, unknown>): Record<string, string> {
  const output: Record<string, string> = {}
  if (typeof input.logoUrl === 'string' && input.logoUrl.trim()) {
    const url = new URL(input.logoUrl)
    if (url.protocol !== 'https:') throw new Error('Email branding logo URL must use HTTPS.')
    output.logoUrl = url.toString()
  }
  if (typeof input.accentColor === 'string' && input.accentColor.trim()) {
    if (!/^#[0-9a-f]{6}$/i.test(input.accentColor.trim())) throw new Error('Email accent color must be a six-digit hex color.')
    output.accentColor = input.accentColor.trim()
  }
  return output
}

function cleanProviderConfiguration(provider: EmailProviderName, input: Record<string, unknown>): Record<string, string> {
  const allowed = provider === 'mailgun'
    ? ['domain', 'baseUrl']
    : provider === 'postmark' ? ['messageStream'] : []
  return Object.fromEntries(allowed.flatMap(key => {
    const value = input[key]
    if (typeof value !== 'string' || !value.trim()) return []
    if (value.length > 500 || /[\r\n]/.test(value)) throw new Error(`Email provider ${key} contains unsupported characters.`)
    return [[key, value.trim()]]
  }))
}
