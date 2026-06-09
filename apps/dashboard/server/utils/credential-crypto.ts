import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'

function deriveKey(encryptionKey: string): Buffer {
  if (!encryptionKey) {
    throw new Error('Credential encryption key is required.')
  }

  return createHash('sha256').update(encryptionKey).digest()
}

export function encryptSecret(secret: string, encryptionKey: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, deriveKey(encryptionKey), iv)
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])

  return [iv, cipher.getAuthTag(), ciphertext].map(value => value.toString('base64url')).join('.')
}

export function decryptSecret(encryptedSecret: string, encryptionKey: string): string {
  const [ivValue, authTagValue, ciphertextValue] = encryptedSecret.split('.')

  if (!ivValue || !authTagValue || !ciphertextValue) {
    throw new Error('Encrypted credential has an invalid format.')
  }

  const decipher = createDecipheriv(ALGORITHM, deriveKey(encryptionKey), Buffer.from(ivValue, 'base64url'))
  decipher.setAuthTag(Buffer.from(authTagValue, 'base64url'))

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, 'base64url')),
    decipher.final()
  ]).toString('utf8')
}
