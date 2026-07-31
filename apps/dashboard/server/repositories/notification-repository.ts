import type {
  EmailDeliveryEvent,
  EmailGlobalSettings,
  EmailProviderConfiguration,
  EmailProviderName,
  SiteNotificationCategory,
  SiteNotificationRecipient
} from '../email/notification-types'
import { useDatabase, type QueryExecutor } from '../utils/database'
import { parseJsonRecord } from '../utils/records'

interface GlobalSettingsRow {
  selected_provider: EmailProviderName
  from_address: string
  from_name: string
  reply_to: string | null
  branding_json: unknown
  updated_by: string
  created_at: string
  updated_at: string
}

interface ProviderConfigurationRow {
  provider: EmailProviderName
  api_key_ciphertext: string | null
  webhook_token_ciphertext: string | null
  configuration_json: unknown
  updated_by: string
  created_at: string
  updated_at: string
}

interface RecipientRow {
  id: string
  site_id: string
  email: string
  display_name: string | null
  enabled: boolean
  created_at: string
  updated_at: string
  categories: SiteNotificationCategory[] | null
}

interface DeliveryEventRow {
  id: string
  provider: EmailProviderName
  provider_event_id: string
  provider_message_id: string | null
  outbox_id: string | null
  recipient_email: string
  event_type: string
  occurred_at: string
  metadata_json: unknown
  created_at: string
}

export interface StoredEmailProviderConfiguration extends EmailProviderConfiguration {
  apiKeyCiphertext: string | null
  webhookTokenCiphertext: string | null
}

function mapGlobal(row: GlobalSettingsRow): EmailGlobalSettings {
  return {
    selectedProvider: row.selected_provider,
    fromAddress: row.from_address,
    fromName: row.from_name,
    replyTo: row.reply_to,
    branding: parseJsonRecord(row.branding_json),
    source: 'database',
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapProvider(row: ProviderConfigurationRow): StoredEmailProviderConfiguration {
  return {
    provider: row.provider,
    apiKeyConfigured: Boolean(row.api_key_ciphertext),
    webhookTokenConfigured: Boolean(row.webhook_token_ciphertext),
    configuration: parseJsonRecord(row.configuration_json),
    operational: row.provider === 'brevo',
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    apiKeyCiphertext: row.api_key_ciphertext,
    webhookTokenCiphertext: row.webhook_token_ciphertext
  }
}

function mapRecipient(row: RecipientRow): SiteNotificationRecipient {
  return {
    id: row.id,
    siteId: row.site_id,
    email: row.email,
    displayName: row.display_name,
    enabled: row.enabled,
    categories: row.categories ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapDeliveryEvent(row: DeliveryEventRow): EmailDeliveryEvent {
  return {
    id: row.id,
    provider: row.provider,
    providerEventId: row.provider_event_id,
    providerMessageId: row.provider_message_id,
    outboxId: row.outbox_id,
    recipientEmail: row.recipient_email,
    eventType: row.event_type,
    occurredAt: row.occurred_at,
    metadata: parseJsonRecord(row.metadata_json),
    createdAt: row.created_at
  }
}

export class NotificationRepository {
  constructor(private readonly database: QueryExecutor = useDatabase()) {}

  async findGlobalSettings(): Promise<EmailGlobalSettings | null> {
    const result = await this.database.query<GlobalSettingsRow>(
      "SELECT * FROM email_global_settings WHERE id = 'global'"
    )
    return result.rows[0] ? mapGlobal(result.rows[0]) : null
  }

  async saveGlobalSettings(settings: EmailGlobalSettings): Promise<EmailGlobalSettings> {
    const result = await this.database.query<GlobalSettingsRow>(`
      INSERT INTO email_global_settings (
        id, selected_provider, from_address, from_name, reply_to,
        branding_json, updated_by, created_at, updated_at
      ) VALUES ('global', $1, $2, $3, $4, $5::jsonb, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE
      SET selected_provider = EXCLUDED.selected_provider,
          from_address = EXCLUDED.from_address,
          from_name = EXCLUDED.from_name,
          reply_to = EXCLUDED.reply_to,
          branding_json = EXCLUDED.branding_json,
          updated_by = EXCLUDED.updated_by,
          updated_at = EXCLUDED.updated_at
      RETURNING *
    `, [
      settings.selectedProvider, settings.fromAddress, settings.fromName,
      settings.replyTo, JSON.stringify(settings.branding), settings.updatedBy,
      settings.createdAt, settings.updatedAt
    ])
    return mapGlobal(result.rows[0]!)
  }

  async findProviderConfiguration(provider: EmailProviderName): Promise<StoredEmailProviderConfiguration | null> {
    const result = await this.database.query<ProviderConfigurationRow>(
      'SELECT * FROM email_provider_configurations WHERE provider = $1',
      [provider]
    )
    return result.rows[0] ? mapProvider(result.rows[0]) : null
  }

  async listProviderConfigurations(): Promise<StoredEmailProviderConfiguration[]> {
    const result = await this.database.query<ProviderConfigurationRow>(
      'SELECT * FROM email_provider_configurations ORDER BY provider'
    )
    return result.rows.map(mapProvider)
  }

  async saveProviderConfiguration(configuration: StoredEmailProviderConfiguration): Promise<StoredEmailProviderConfiguration> {
    const result = await this.database.query<ProviderConfigurationRow>(`
      INSERT INTO email_provider_configurations (
        provider, api_key_ciphertext, webhook_token_ciphertext,
        configuration_json, updated_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
      ON CONFLICT (provider) DO UPDATE
      SET api_key_ciphertext = EXCLUDED.api_key_ciphertext,
          webhook_token_ciphertext = EXCLUDED.webhook_token_ciphertext,
          configuration_json = EXCLUDED.configuration_json,
          updated_by = EXCLUDED.updated_by,
          updated_at = EXCLUDED.updated_at
      RETURNING *
    `, [
      configuration.provider, configuration.apiKeyCiphertext,
      configuration.webhookTokenCiphertext,
      JSON.stringify(configuration.configuration), configuration.updatedBy,
      configuration.createdAt, configuration.updatedAt
    ])
    return mapProvider(result.rows[0]!)
  }

  async listRecipients(siteId: string, category?: SiteNotificationCategory): Promise<SiteNotificationRecipient[]> {
    const values: unknown[] = [siteId]
    const categoryFilter = category
      ? `AND EXISTS (
          SELECT 1 FROM site_notification_subscriptions selected
          WHERE selected.recipient_id = recipient.id
            AND selected.category = $2
            AND selected.enabled = TRUE
        )`
      : ''
    if (category) values.push(category)
    const result = await this.database.query<RecipientRow>(`
      SELECT recipient.*,
        COALESCE(
          ARRAY_AGG(subscription.category ORDER BY subscription.category)
            FILTER (WHERE subscription.enabled = TRUE),
          ARRAY[]::text[]
        ) AS categories
      FROM site_notification_recipients recipient
      LEFT JOIN site_notification_subscriptions subscription
        ON subscription.recipient_id = recipient.id
      WHERE recipient.site_id = $1
        ${categoryFilter}
      GROUP BY recipient.id
      ORDER BY recipient.email
    `, values)
    return result.rows.map(mapRecipient)
  }

  async findRecipient(siteId: string, recipientId: string): Promise<SiteNotificationRecipient | null> {
    const recipients = await this.listRecipients(siteId)
    return recipients.find(recipient => recipient.id === recipientId) ?? null
  }

  async saveRecipient(recipient: SiteNotificationRecipient): Promise<void> {
    await this.database.query(`
      INSERT INTO site_notification_recipients (
        id, site_id, email, display_name, enabled, created_at, updated_at
      ) VALUES ($1, $2, LOWER($3), $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE
      SET email = LOWER(EXCLUDED.email),
          display_name = EXCLUDED.display_name,
          enabled = EXCLUDED.enabled,
          updated_at = EXCLUDED.updated_at
    `, [
      recipient.id, recipient.siteId, recipient.email, recipient.displayName,
      recipient.enabled, recipient.createdAt, recipient.updatedAt
    ])
  }

  async replaceRecipientCategories(
    recipientId: string,
    categories: SiteNotificationCategory[],
    now: string
  ): Promise<void> {
    await this.database.query(
      'DELETE FROM site_notification_subscriptions WHERE recipient_id = $1',
      [recipientId]
    )
    for (const category of categories) {
      await this.database.query(`
        INSERT INTO site_notification_subscriptions (
          recipient_id, category, enabled, created_at, updated_at
        ) VALUES ($1, $2, TRUE, $3, $3)
      `, [recipientId, category, now])
    }
  }

  async deleteRecipient(siteId: string, recipientId: string): Promise<boolean> {
    const result = await this.database.query(
      'DELETE FROM site_notification_recipients WHERE id = $1 AND site_id = $2',
      [recipientId, siteId]
    )
    return result.rowCount === 1
  }

  async isSuppressed(email: string): Promise<boolean> {
    const result = await this.database.query(`
      SELECT 1 FROM email_suppressions
      WHERE LOWER(recipient_email) = LOWER($1) AND lifted_at IS NULL
    `, [email])
    return Boolean(result.rows[0])
  }

  async suppress(email: string, reason: string, source: string, now: string): Promise<void> {
    await this.database.query(`
      INSERT INTO email_suppressions (
        recipient_email, reason, source, created_at, lifted_at, lifted_by
      ) VALUES (LOWER($1), $2, $3, $4, NULL, NULL)
      ON CONFLICT (recipient_email) DO UPDATE
      SET reason = EXCLUDED.reason,
          source = EXCLUDED.source,
          created_at = EXCLUDED.created_at,
          lifted_at = NULL,
          lifted_by = NULL
    `, [email, reason, source, now])
  }

  async liftSuppression(email: string, actorIdentifier: string, now: string): Promise<boolean> {
    const result = await this.database.query(`
      UPDATE email_suppressions
      SET lifted_at = $2, lifted_by = $3
      WHERE LOWER(recipient_email) = LOWER($1) AND lifted_at IS NULL
    `, [email, now, actorIdentifier])
    return result.rowCount === 1
  }

  async listSuppressions(): Promise<Array<{
    recipientEmail: string
    reason: string
    source: string
    createdAt: string
    liftedAt: string | null
    liftedBy: string | null
  }>> {
    const result = await this.database.query<{
      recipient_email: string
      reason: string
      source: string
      created_at: string
      lifted_at: string | null
      lifted_by: string | null
    }>('SELECT * FROM email_suppressions ORDER BY created_at DESC')
    return result.rows.map(row => ({
      recipientEmail: row.recipient_email,
      reason: row.reason,
      source: row.source,
      createdAt: row.created_at,
      liftedAt: row.lifted_at,
      liftedBy: row.lifted_by
    }))
  }

  async createDeliveryEvent(event: EmailDeliveryEvent): Promise<boolean> {
    const result = await this.database.query(`
      INSERT INTO email_delivery_events (
        id, provider, provider_event_id, provider_message_id, outbox_id,
        recipient_email, event_type, occurred_at, metadata_json, created_at
      ) VALUES ($1, $2, $3, $4, $5, LOWER($6), $7, $8, $9::jsonb, $10)
      ON CONFLICT (provider, provider_event_id) DO NOTHING
    `, [
      event.id, event.provider, event.providerEventId, event.providerMessageId,
      event.outboxId, event.recipientEmail, event.eventType, event.occurredAt,
      JSON.stringify(event.metadata), event.createdAt
    ])
    return result.rowCount === 1
  }

  async listDeliveryEvents(limit = 100): Promise<EmailDeliveryEvent[]> {
    const result = await this.database.query<DeliveryEventRow>(`
      SELECT * FROM email_delivery_events
      ORDER BY occurred_at DESC
      LIMIT $1
    `, [Math.min(500, Math.max(1, limit))])
    return result.rows.map(mapDeliveryEvent)
  }
}
