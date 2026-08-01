export const SITECARE_DISPLAY_TIME_ZONE = 'America/New_York'

type DateInput = string | number | Date

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SITECARE_DISPLAY_TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true
})

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SITECARE_DISPLAY_TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric'
})

export function formatSiteCareDateTime(value: DateInput): string {
  const parts = partsFor(value, dateTimeFormatter)
  if (!parts) return '—'
  return `${parts.month}/${parts.day}/${parts.year}, ${parts.hour}:${parts.minute}:${parts.second} ${parts.dayPeriod}`
}

export function formatSiteCareDate(value: DateInput): string {
  const parts = partsFor(value, dateFormatter)
  if (!parts) return '—'
  return `${parts.month}/${parts.day}/${parts.year}`
}

function partsFor(value: DateInput, formatter: Intl.DateTimeFormat): Record<string, string> | null {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return Object.fromEntries(
    formatter.formatToParts(date)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  )
}
