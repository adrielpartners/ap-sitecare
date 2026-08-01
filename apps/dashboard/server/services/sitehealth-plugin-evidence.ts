export interface NormalizedPluginSiteHealthEvidence {
  collectedAt: string
  content: {
    publishedPageCount: number
    pages: Array<{ id: number, title: string, url: string, modifiedAt: string | null, wordCount: number }>
  }
  media: {
    attachmentCount: number
    totalBytes: number | null
    largeImages: Array<{ id: number, title: string, url: string, mimeType: string, sizeBytes: number }>
    optimizationCandidates: Array<{ id: number, title: string, url: string, mimeType: string, sizeBytes: number }>
    unusedCandidates: Array<{ id: number, title: string, url: string, mimeType: string, sizeBytes: number | null }>
  }
  users: {
    userCount: number
    accounts: Array<{ id: number, displayName: string, roles: string[], registeredAt: string | null }>
    lastActivityAvailable: false
  }
  environment: {
    wordpressVersion: string
    phpVersion: string
    homeUrl: string
    homeUsesHttps: boolean
    uploadsBytes: number | null
    wordpressBytes: number | null
  }
  database: {
    sizeBytes: number | null
    tableCount: number | null
    revisionCount: number | null
    transientCount: number | null
    expiredTransientCount: number | null
    autoloadBytes: number | null
  }
  limitations: string[]
}

export function normalizePluginSiteHealthEvidence(value: unknown): NormalizedPluginSiteHealthEvidence | null {
  if (value === undefined || value === null) return null
  const source = requiredRecord(value, 'siteHealthEvidence')
  const content = requiredRecord(source.content, 'siteHealthEvidence.content')
  const media = requiredRecord(source.media, 'siteHealthEvidence.media')
  const users = requiredRecord(source.users, 'siteHealthEvidence.users')
  const environment = requiredRecord(source.environment, 'siteHealthEvidence.environment')
  const database = requiredRecord(source.database, 'siteHealthEvidence.database')
  return {
    collectedAt: requiredDate(source.collectedAt, 'siteHealthEvidence.collectedAt'),
    content: {
      publishedPageCount: nonNegativeInteger(content.publishedPageCount, 'siteHealthEvidence.content.publishedPageCount'),
      pages: normalizedArray(content.pages, 500, (item, index) => {
        const page = requiredRecord(item, `siteHealthEvidence.content.pages[${index}]`)
        return {
          id: nonNegativeInteger(page.id, `siteHealthEvidence.content.pages[${index}].id`),
          title: text(page.title, 300),
          url: httpUrl(page.url, `siteHealthEvidence.content.pages[${index}].url`),
          modifiedAt: optionalDate(page.modifiedAt, `siteHealthEvidence.content.pages[${index}].modifiedAt`),
          wordCount: nonNegativeInteger(page.wordCount, `siteHealthEvidence.content.pages[${index}].wordCount`)
        }
      })
    },
    media: {
      attachmentCount: nonNegativeInteger(media.attachmentCount, 'siteHealthEvidence.media.attachmentCount'),
      totalBytes: optionalInteger(media.totalBytes, 'siteHealthEvidence.media.totalBytes'),
      largeImages: normalizedArray(media.largeImages, 300, normalizeMedia),
      optimizationCandidates: normalizedArray(media.optimizationCandidates, 300, normalizeMedia),
      unusedCandidates: normalizedArray(media.unusedCandidates, 300, (item, index) => {
        const normalized = normalizeMedia(item, index)
        return { ...normalized, sizeBytes: normalized.sizeBytes || null }
      })
    },
    users: {
      userCount: nonNegativeInteger(users.userCount, 'siteHealthEvidence.users.userCount'),
      accounts: normalizedArray(users.accounts, 500, (item, index) => {
        const account = requiredRecord(item, `siteHealthEvidence.users.accounts[${index}]`)
        return {
          id: nonNegativeInteger(account.id, `siteHealthEvidence.users.accounts[${index}].id`),
          displayName: text(account.displayName, 300),
          roles: stringArray(account.roles, 20, 100),
          registeredAt: optionalDate(account.registeredAt, `siteHealthEvidence.users.accounts[${index}].registeredAt`)
        }
      }),
      lastActivityAvailable: false
    },
    environment: {
      wordpressVersion: text(environment.wordpressVersion, 100),
      phpVersion: text(environment.phpVersion, 100),
      homeUrl: httpUrl(environment.homeUrl, 'siteHealthEvidence.environment.homeUrl'),
      homeUsesHttps: environment.homeUsesHttps === true,
      uploadsBytes: optionalInteger(environment.uploadsBytes, 'siteHealthEvidence.environment.uploadsBytes'),
      wordpressBytes: optionalInteger(environment.wordpressBytes, 'siteHealthEvidence.environment.wordpressBytes')
    },
    database: {
      sizeBytes: optionalInteger(database.sizeBytes, 'siteHealthEvidence.database.sizeBytes'),
      tableCount: optionalInteger(database.tableCount, 'siteHealthEvidence.database.tableCount'),
      revisionCount: optionalInteger(database.revisionCount, 'siteHealthEvidence.database.revisionCount'),
      transientCount: optionalInteger(database.transientCount, 'siteHealthEvidence.database.transientCount'),
      expiredTransientCount: optionalInteger(database.expiredTransientCount, 'siteHealthEvidence.database.expiredTransientCount'),
      autoloadBytes: optionalInteger(database.autoloadBytes, 'siteHealthEvidence.database.autoloadBytes')
    },
    limitations: stringArray(source.limitations, 50, 500)
  }
}

function normalizeMedia(item: unknown, index: number) {
  const media = requiredRecord(item, `siteHealthEvidence.media.items[${index}]`)
  return {
    id: nonNegativeInteger(media.id, `siteHealthEvidence.media.items[${index}].id`),
    title: text(media.title, 300),
    url: httpUrl(media.url, `siteHealthEvidence.media.items[${index}].url`),
    mimeType: text(media.mimeType, 100),
    sizeBytes: nonNegativeInteger(media.sizeBytes, `siteHealthEvidence.media.items[${index}].sizeBytes`)
  }
}

function requiredRecord(value: unknown, key: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${key} must be an object.`)
  return value as Record<string, unknown>
}

function normalizedArray<T>(value: unknown, maximum: number, normalize: (value: unknown, index: number) => T): T[] {
  if (!Array.isArray(value)) return []
  if (value.length > maximum) throw new Error(`SiteHealth evidence exceeds the ${maximum}-item limit.`)
  return value.map(normalize)
}

function stringArray(value: unknown, maximumItems: number, maximumLength: number): string[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, maximumItems).filter((item): item is string => typeof item === 'string')
    .map(item => item.trim().slice(0, maximumLength)).filter(Boolean)
}

function text(value: unknown, maximum: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : ''
}

function httpUrl(value: unknown, key: string): string {
  const candidate = text(value, 2_000)
  try {
    const parsed = new URL(candidate)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error()
    return parsed.toString()
  } catch {
    throw new Error(`${key} must be an HTTP or HTTPS URL.`)
  }
}

function nonNegativeInteger(value: unknown, key: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(`${key} must be a non-negative integer.`)
  return Number(value)
}

function optionalInteger(value: unknown, key: string): number | null {
  if (value === null || value === undefined) return null
  return nonNegativeInteger(value, key)
}

function requiredDate(value: unknown, key: string): string {
  const candidate = text(value, 100)
  if (!candidate || !Number.isFinite(Date.parse(candidate))) throw new Error(`${key} must be an ISO 8601 timestamp.`)
  return new Date(candidate).toISOString()
}

function optionalDate(value: unknown, key: string): string | null {
  return value === null || value === undefined || value === '' ? null : requiredDate(value, key)
}
