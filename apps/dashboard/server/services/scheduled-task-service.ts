import type { ScheduledTask } from '../domain/types'

function nextUtcTime(now: Date, target: { day?: number, date?: number, hour: number }): Date {
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    target.date ?? now.getUTCDate(),
    target.hour
  ))

  if (target.day !== undefined) {
    const daysUntilTarget = (target.day - next.getUTCDay() + 7) % 7
    next.setUTCDate(next.getUTCDate() + daysUntilTarget)
  }

  if (next <= now) {
    if (target.day !== undefined) next.setUTCDate(next.getUTCDate() + 7)
    else if (target.date !== undefined) next.setUTCMonth(next.getUTCMonth() + 1)
    else next.setUTCDate(next.getUTCDate() + 1)
  }

  return next
}

export class ScheduledTaskService {
  list(now = new Date()): ScheduledTask[] {
    const tasks: ScheduledTask[] = [
      {
        id: 'daily-check-in',
        label: 'Daily check-in review',
        description: 'Review the latest reporter check-ins across managed sites.',
        scheduledFor: nextUtcTime(now, { hour: 13 }).toISOString(),
        status: 'scheduled'
      },
      {
        id: 'weekly-security-scan',
        label: 'Weekly security scan',
        description: 'Security scan orchestration is planned and remains observation-only.',
        scheduledFor: nextUtcTime(now, { day: 1, hour: 14 }).toISOString(),
        status: 'scheduled'
      },
      {
        id: 'monthly-report',
        label: 'Monthly operations report',
        description: 'Report generation is planned but not yet connected to a job.',
        scheduledFor: nextUtcTime(now, { date: 1, hour: 15 }).toISOString(),
        status: 'scheduled'
      },
      {
        id: 'monthly-offsite-archive',
        label: 'Monthly offsite archive',
        description: 'Archive verification is planned and will remain read-only.',
        scheduledFor: nextUtcTime(now, { date: 1, hour: 16 }).toISOString(),
        status: 'scheduled'
      }
    ]

    return tasks.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))
  }
}
