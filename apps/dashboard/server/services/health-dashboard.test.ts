import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { calculateSnapshotStatus } from './health-service'

describe('Phase 6 health status calculation', () => {
  it('maps update pressure to normalized health statuses', () => {
    assert.equal(calculateSnapshotStatus(0, 0), 'healthy')
    assert.equal(calculateSnapshotStatus(1, 0), 'attention')
    assert.equal(calculateSnapshotStatus(8, 2), 'critical')
  })
})
