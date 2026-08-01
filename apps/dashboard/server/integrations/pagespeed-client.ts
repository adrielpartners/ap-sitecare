export type PageSpeedStrategy = 'desktop' | 'mobile'

export interface PageSpeedResult {
  strategy: PageSpeedStrategy
  analyzedAt: string
  requestedUrl: string
  finalUrl: string
  performanceScore: number | null
  labMetrics: Record<string, { numericValue: number | null, displayValue: string | null }>
  coreWebVitals: Record<string, { percentile: number | null, category: string | null }>
  opportunities: Array<{ id: string, title: string, displayValue: string | null, score: number | null }>
  warnings: string[]
}

export class PageSpeedClient {
  constructor(
    private readonly apiKey = '',
    private readonly request: typeof fetch = fetch,
    private readonly baseUrl = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'
  ) {}

  async analyze(url: string, strategy: PageSpeedStrategy): Promise<PageSpeedResult> {
    const endpoint = new URL(this.baseUrl)
    endpoint.searchParams.set('url', url)
    endpoint.searchParams.set('strategy', strategy)
    endpoint.searchParams.append('category', 'performance')
    if (this.apiKey) endpoint.searchParams.set('key', this.apiKey)

    const response = await this.request(endpoint, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(90_000)
    })
    if (!response.ok) {
      const body = await response.text()
      throw new Error(`PageSpeed ${strategy} analysis failed with HTTP ${response.status}: ${safeMessage(body)}`)
    }
    return normalizePageSpeed(await response.json() as Record<string, unknown>, strategy, url)
  }
}

function normalizePageSpeed(payload: Record<string, unknown>, strategy: PageSpeedStrategy, requestedUrl: string): PageSpeedResult {
  const lighthouse = record(payload.lighthouseResult)
  const runtimeError = record(lighthouse.runtimeError)
  if (typeof runtimeError.message === 'string' && runtimeError.message) {
    throw new Error(`PageSpeed ${strategy} analysis could not complete: ${runtimeError.message}`)
  }
  const categories = record(lighthouse.categories)
  const performance = record(categories.performance)
  const audits = record(lighthouse.audits)
  const experience = record(payload.loadingExperience)
  const originExperience = record(payload.originLoadingExperience)
  const fieldMetrics = Object.keys(record(experience.metrics)).length
    ? record(experience.metrics)
    : record(originExperience.metrics)

  return {
    strategy,
    analyzedAt: dateText(payload.analysisUTCTimestamp) ?? dateText(lighthouse.fetchTime) ?? new Date().toISOString(),
    requestedUrl,
    finalUrl: text(lighthouse.finalUrl) ?? text(payload.id) ?? requestedUrl,
    performanceScore: typeof performance.score === 'number' ? Math.round(performance.score * 100) : null,
    labMetrics: {
      firstContentfulPaint: auditMetric(audits, 'first-contentful-paint'),
      largestContentfulPaint: auditMetric(audits, 'largest-contentful-paint'),
      speedIndex: auditMetric(audits, 'speed-index'),
      totalBlockingTime: auditMetric(audits, 'total-blocking-time'),
      cumulativeLayoutShift: auditMetric(audits, 'cumulative-layout-shift')
    },
    coreWebVitals: {
      largestContentfulPaint: fieldMetric(fieldMetrics, 'LARGEST_CONTENTFUL_PAINT_MS'),
      interactionToNextPaint: fieldMetric(fieldMetrics, 'INTERACTION_TO_NEXT_PAINT'),
      cumulativeLayoutShift: fieldMetric(fieldMetrics, 'CUMULATIVE_LAYOUT_SHIFT_SCORE')
    },
    opportunities: Object.entries(audits)
      .map(([id, value]) => ({ id, audit: record(value) }))
      .filter(({ audit }) => typeof audit.score === 'number' && audit.score < 0.9 && text(audit.title))
      .sort((left, right) => Number(left.audit.score) - Number(right.audit.score))
      .slice(0, 12)
      .map(({ id, audit }) => ({
        id,
        title: text(audit.title)!,
        displayValue: text(audit.displayValue),
        score: typeof audit.score === 'number' ? audit.score : null
      })),
    warnings: Array.isArray(lighthouse.runWarnings)
      ? lighthouse.runWarnings.filter((value): value is string => typeof value === 'string').slice(0, 20)
      : []
  }
}

function auditMetric(audits: Record<string, unknown>, key: string): { numericValue: number | null, displayValue: string | null } {
  const audit = record(audits[key])
  return {
    numericValue: typeof audit.numericValue === 'number' ? audit.numericValue : null,
    displayValue: text(audit.displayValue)
  }
}

function fieldMetric(metrics: Record<string, unknown>, key: string): { percentile: number | null, category: string | null } {
  const metric = record(metrics[key])
  return {
    percentile: typeof metric.percentile === 'number' ? metric.percentile : null,
    category: text(metric.category)
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function dateText(value: unknown): string | null {
  const valueText = text(value)
  return valueText && Number.isFinite(Date.parse(valueText)) ? new Date(valueText).toISOString() : null
}

function safeMessage(value: string): string {
  return value.replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]').replace(/\s+/g, ' ').slice(0, 400)
}
