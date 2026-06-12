import type { StorageProviderConfiguration, StorageProviderType } from '../domain/types'

export interface StorageProviderTestResult {
  provider: StorageProviderType
  configured: boolean
  connected: boolean
  message: string
  checkedAt: string
}

export interface StorageProvider {
  readonly type: StorageProviderType
  configuration(): StorageProviderConfiguration
  testConnection(): Promise<StorageProviderTestResult>
}

export interface StorageObjectMetadata {
  path: string
  sizeBytes: number
}

export interface StorageUploadResult extends StorageObjectMetadata {
  verified: boolean
}
