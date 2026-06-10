import type { H3Event } from 'h3'

export interface RuntimeSettings {
  auth: {
    developmentBypass: boolean
    developmentEmail: string
  }
  integrations: {
    cloudflareApiToken: string
    dropboxAccessToken: string
    dropboxBackupRoot: string
    hostingerApiBaseUrl: string
    hostingerApiToken: string
  }
  credentialEncryptionKey: string
  databasePath: string
}

export function getRuntimeSettings(event?: H3Event): RuntimeSettings {
  return useRuntimeConfig(event) as unknown as RuntimeSettings
}
