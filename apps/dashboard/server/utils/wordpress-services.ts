import type { H3Event } from 'h3'
import { CredentialService } from '../services/credential-service'
import { WordPressConnectorService } from '../services/wordpress-connector-service'
import { getRuntimeSettings } from './config'

export function getWordPressConnectorService(event?: H3Event): WordPressConnectorService {
  return new WordPressConnectorService(
    new CredentialService(getRuntimeSettings(event).credentialEncryptionKey)
  )
}
