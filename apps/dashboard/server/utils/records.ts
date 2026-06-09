export function parseJsonRecord(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value)
  return parsed && !Array.isArray(parsed) && typeof parsed === 'object'
    ? parsed as Record<string, unknown>
    : {}
}

export function stringifyRecord(value: Record<string, unknown> | undefined): string {
  return JSON.stringify(value ?? {})
}
