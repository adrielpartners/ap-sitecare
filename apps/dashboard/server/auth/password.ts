import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

const algorithm = 'scrypt'
const cost = 2 ** 17
const blockSize = 8
const parallelization = 1
const keyLength = 64
const maxmem = 256 * 1024 * 1024

export interface PasswordHasher {
  hash(password: string): Promise<string>
  verify(password: string, encodedHash: string): Promise<boolean>
}

export function validatePassword(password: string): void {
  if (password.length < 12) throw new Error('Password must be at least 12 characters.')
  if (password.length > 128) throw new Error('Password must be no more than 128 characters.')
}

export class ScryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    validatePassword(password)
    const salt = randomBytes(16)
    const derived = await derive(password, salt)
    return [
      algorithm,
      `N=${cost}`,
      `r=${blockSize}`,
      `p=${parallelization}`,
      salt.toString('base64url'),
      derived.toString('base64url')
    ].join('$')
  }

  async verify(password: string, encodedHash: string): Promise<boolean> {
    const parsed = parseHash(encodedHash)
    if (!parsed) {
      await derive(password, randomBytes(16))
      return false
    }
    const actual = await derive(password, parsed.salt, parsed.cost, parsed.blockSize, parsed.parallelization)
    return actual.length === parsed.hash.length && timingSafeEqual(actual, parsed.hash)
  }
}

async function derive(
  password: string,
  salt: Buffer,
  selectedCost = cost,
  selectedBlockSize = blockSize,
  selectedParallelization = parallelization
): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyLength, {
      N: selectedCost,
      r: selectedBlockSize,
      p: selectedParallelization,
      maxmem
    }, (error, derivedKey) => {
      if (error) reject(error)
      else resolve(derivedKey)
    })
  })
}

function parseHash(encodedHash: string): {
  cost: number
  blockSize: number
  parallelization: number
  salt: Buffer
  hash: Buffer
} | null {
  const [name, encodedCost, encodedBlockSize, encodedParallelization, encodedSalt, encodedValue] = encodedHash.split('$')
  if (
    name !== algorithm
    || !encodedCost?.startsWith('N=')
    || !encodedBlockSize?.startsWith('r=')
    || !encodedParallelization?.startsWith('p=')
    || !encodedSalt
    || !encodedValue
  ) return null

  const parsed = {
    cost: Number(encodedCost.slice(2)),
    blockSize: Number(encodedBlockSize.slice(2)),
    parallelization: Number(encodedParallelization.slice(2)),
    salt: Buffer.from(encodedSalt, 'base64url'),
    hash: Buffer.from(encodedValue, 'base64url')
  }
  if (
    !Number.isInteger(parsed.cost)
    || !Number.isInteger(parsed.blockSize)
    || !Number.isInteger(parsed.parallelization)
    || parsed.salt.length < 16
    || parsed.hash.length !== keyLength
  ) return null
  return parsed
}
