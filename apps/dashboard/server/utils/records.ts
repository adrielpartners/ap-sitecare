export function parseJsonRecord(value: unknown): Record<string, unknown> {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value
  return parsed && !Array.isArray(parsed) && typeof parsed === 'object'
    ? parsed as Record<string, unknown>
    : {}
}

export function stringifyRecord(value: Record<string, unknown> | undefined): string {
  return JSON.stringify(value ?? {})
}
