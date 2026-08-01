import { canAccessSite } from '../../../../../auth/authorization'
import { SiteHealthService } from '../../../../../services/sitehealth-service'
import { requireAccessIdentity } from '../../../../../utils/auth'

export default defineEventHandler(async (event) => {
  const reviewId = getRouterParam(event, 'reviewId')
  const identity = requireAccessIdentity(event)
  if (!reviewId) throw createError({ statusCode: 404, statusMessage: 'Review not found.' })
  const review = await new SiteHealthService().getClientPublishedReview(reviewId)
  if (!canAccessSite(identity, review.siteId)) throw createError({ statusCode: 404, statusMessage: 'Review not found.' })
  const html = clientReviewHtml(review)
  setResponseHeaders(event, {
    'content-type': 'text/html; charset=utf-8',
    'content-disposition': `attachment; filename="sitehealth-review-${review.id}.html"`,
    'cache-control': 'no-store, private',
    'x-content-type-options': 'nosniff'
  })
  return html
})

function clientReviewHtml(review: Awaited<ReturnType<SiteHealthService['getClientPublishedReview']>>): string {
  const findings = review.content.findings.map(item => `<li><strong>${escape(item.title)}</strong> — ${escape(item.description)}</li>`).join('')
  const recommendations = review.content.recommendations.map(item => `<li><strong>${escape(item.title)}</strong> — ${escape(item.description)}</li>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(review.title)}</title><style>body{font:16px/1.55 system-ui;max-width:800px;margin:48px auto;padding:0 24px;color:#172033}h1,h2{line-height:1.2}li{margin:12px 0}.meta{color:#667085}</style></head><body><p class="meta">SiteHealth Review · Version ${review.version}</p><h1>${escape(review.title)}</h1><p>${escape(review.executiveSummary)}</p><h2>Findings</h2><ul>${findings || '<li>No active findings.</li>'}</ul><h2>Recommendations</h2><ul>${recommendations || '<li>No maintenance recommendations.</li>'}</ul><p>${escape(review.content.approvalInstructions)}</p></body></html>`
}

function escape(value: string): string { return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;') }
