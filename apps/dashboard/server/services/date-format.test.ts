import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatSiteCareDate, formatSiteCareDateTime, SITECARE_DISPLAY_TIME_ZONE } from '../../utils/date-format'

describe('SiteCare date formatting', () => {
  it('uses one explicit business timezone on the server and in the browser', () => {
    assert.equal(SITECARE_DISPLAY_TIME_ZONE, 'America/New_York')
    assert.equal(formatSiteCareDateTime('2026-07-31T20:20:50.000Z'), '7/31/2026, 4:20:50 PM')
    assert.equal(formatSiteCareDate('2026-08-01T02:00:00.000Z'), '7/31/2026')
  })

  it('returns a stable fallback for invalid provider dates', () => {
    assert.equal(formatSiteCareDateTime('not-a-date'), '—')
    assert.equal(formatSiteCareDate('not-a-date'), '—')
  })
})
