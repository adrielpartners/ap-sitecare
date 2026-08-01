const sensitiveKey = /(password|secret|token|credential|authorization|cookie|api[-_]?key)/i

export function logOperationalEvent(
  level: 'info' | 'warn' | 'error',
  event: string,
  metadata: Record<string, unknown> = {}
): void {
  const safeMetadata = sanitize(metadata) as Record<string, unknown>
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    service: process.env.SITECARE_PROCESS_NAME || 'sitecare-dashboard',
    ...safeMetadata
  })
  if (level === 'error') console.error(entry)
  else if (level === 'warn') console.warn(entry)
  else console.info(entry)
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[depth-limit]'
  if (Array.isArray(value)) return value.slice(0, 50).map(item => sanitize(item, depth + 1))
  if (!value || typeof value !== 'object') return typeof value === 'string' ? value.slice(0, 2_000) : value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
    key,
    sensitiveKey.test(key) ? '[redacted]' : sanitize(item, depth + 1)
  ]))
}

export function safeOperationalError(error: unknown): { errorName: string, errorMessage: string } {
  return error instanceof Error
    ? { errorName: error.name, errorMessage: error.message.slice(0, 2_000) }
    : { errorName: 'UnknownError', errorMessage: 'An unknown operational error occurred.' }
}
