import assert from 'node:assert/strict'
import test from 'node:test'
import AdmZip from 'adm-zip'
import type { PluginUpdatePackage, PluginUpdateRollout, PluginUpdateTarget } from '../domain/plugin-update'
import { AuditRepository } from '../repositories/audit-repository'
import { IdentityRepository } from '../repositories/identity-repository'
import { PluginUpdateRepository } from '../repositories/plugin-update-repository'
import { SiteRepository } from '../repositories/site-repository'
import { createTestDatabase, destroyTestDatabase } from '../testing/postgres-test-database'
import { AuditService } from './audit-service'
import { generateTotp, MfaService, verifyTotp } from './mfa-service'
import { inspectPluginArchive, validateArchivePath } from './plugin-package-service'
import { compareVersions } from './plugin-rollout-service'
import { SiteService } from './site-service'

test('plugin archive validation derives a stable slug, version, and checksum-ready manifest', () => {
  const archive = new AdmZip()
  archive.addFile('vendor-plugin/vendor-plugin.php', Buffer.from(`<?php
/**
 * Plugin Name: Vendor Plugin
 * Version: 2.4.1
 */
`))
  archive.addFile('vendor-plugin/readme.txt', Buffer.from('Plugin documentation'))
  assert.deepEqual(inspectPluginArchive(archive.toBuffer()), {
    slug: 'vendor-plugin',
    name: 'Vendor Plugin',
    version: '2.4.1',
    pluginFile: 'vendor-plugin/vendor-plugin.php',
    entryCount: 2,
    expandedBytes: 82
  })
})

test('plugin archive validation rejects traversal and multiple top-level plugin roots', () => {
  assert.throws(() => validateArchivePath('../wp-config.php'), /path traversal/)
  const archive = new AdmZip()
  archive.addFile('one/one.php', Buffer.from('<?php /* Plugin Name: One\nVersion: 1.0.0 */'))
  archive.addFile('two/two.php', Buffer.from('<?php /* Plugin Name: Two\nVersion: 1.0.0 */'))
  assert.throws(() => inspectPluginArchive(archive.toBuffer()), /exactly one top-level/)
})

test('version comparison handles normal WordPress release sequences', () => {
  assert.equal(compareVersions('1.9.9', '2.0.0'), -1)
  assert.equal(compareVersions('2.0.0', '2.0.0'), 0)
  assert.equal(compareVersions('2.0.1', '2.0.0'), 1)
  assert.equal(compareVersions('2.0.0-beta', '2.0.0'), -1)
})

test('TOTP verification permits the current window and rejects unrelated codes', () => {
  const secret = 'JBSWY3DPEHPK3PXP'
  const at = Date.UTC(2026, 6, 31, 12, 0, 0)
  const code = generateTotp(secret, at)
  assert.match(code, /^\d{6}$/)
  assert.equal(verifyTotp(secret, code, at), true)
  assert.equal(verifyTotp(secret, code === '000000' ? '111111' : '000000', at), false)
})

test('rollout persistence deduplicates packages, assigns a canary, and consumes download claims once', async () => {
  const database = await createTestDatabase()
  try {
    const repository = new PluginUpdateRepository(database)
    const audit = new AuditService(new AuditRepository(database))
    const siteService = new SiteService(new SiteRepository(database), audit)
    const firstSite = await siteService.create({ name: 'Canary Site', url: 'https://canary.example' })
    const secondSite = await siteService.create({ name: 'Batch Site', url: 'https://batch.example' })
    const at = '2026-07-31T12:00:00.000Z'
    const packageValue: PluginUpdatePackage = {
      id: 'package-original', pluginSlug: 'vendor-plugin', pluginName: 'Vendor Plugin',
      version: '2.4.1', originalFilename: 'vendor-plugin.zip', checksumSha256: 'a'.repeat(64),
      sizeBytes: 123, storagePath: '/private/package.zip', validationStatus: 'validated',
      scanStatus: 'external-unavailable', provenance: {}, manifest: {}, uploadedBy: 'admin@example.com', createdAt: at
    }
    assert.equal((await repository.savePackage(packageValue)).id, packageValue.id)
    assert.equal((await repository.savePackage({ ...packageValue, id: 'package-duplicate' })).id, packageValue.id)

    const rollout: PluginUpdateRollout = {
      id: 'rollout-one', packageId: packageValue.id, actionRequestId: null, status: 'draft',
      canarySize: 1, failureThreshold: 1, concurrencyLimit: 2, haltReason: null,
      createdBy: 'admin@example.com', confirmedBy: null, confirmedAt: null,
      startedAt: null, completedAt: null, createdAt: at, updatedAt: at
    }
    const target = (id: string, siteId: string): PluginUpdateTarget => ({
      id, rolloutId: rollout.id, siteId, pluginFile: 'vendor-plugin/vendor-plugin.php',
      installedVersion: '2.3.0', targetVersion: '2.4.1', resultingVersion: null,
      category: 'eligible', selected: true, recoveryReady: true, recoveryEvidenceId: null,
      preflightStatus: 'passed', preflightMessage: null, batchNumber: null, status: 'pending',
      automationJobId: null, attemptCount: 0, startedAt: null, completedAt: null,
      errorCode: null, errorMessage: null, response: {}, createdAt: at, updatedAt: at
    })
    await repository.createRollout(rollout, [target('target-one', firstSite.id), target('target-two', secondSite.id)])
    const batched = await repository.prepareBatches(rollout.id, 1, at)
    assert.equal(batched.filter(value => value.batchNumber === 0).length, 1)
    assert.equal(batched.filter(value => value.batchNumber === 1).length, 1)

    await repository.saveDownloadToken({
      tokenHash: 'token-hash', packageId: packageValue.id, targetId: 'target-one',
      expiresAt: '2026-07-31T12:10:00.000Z', createdAt: at
    })
    assert.deepEqual(await repository.claimDownloadToken('token-hash', '2026-07-31T12:01:00.000Z'), {
      packageId: packageValue.id,
      targetId: 'target-one'
    })
    assert.equal(await repository.claimDownloadToken('token-hash', '2026-07-31T12:02:00.000Z'), null)

    const userId = 'mfa-rollout-admin'
    await new IdentityRepository(database).createUser({
      id: userId, email: 'rollout-admin@example.com', displayName: 'Rollout Admin',
      status: 'active', mfaRequired: true, mfaEnrolledAt: null, lastLoginAt: null,
      createdAt: at, updatedAt: at, disabledAt: null
    }, 'test-password-hash')
    const mfa = new MfaService('test-encryption-key', database, audit)
    const enrollment = await mfa.beginEnrollment(userId, 'rollout-admin@example.com')
    const completed = await mfa.completeEnrollment(userId, generateTotp(enrollment.secret))
    assert.equal(completed.recoveryCodes.length, 8)
    await mfa.verifyStepUp(userId, completed.recoveryCodes[0]!)
    await assert.rejects(mfa.verifyStepUp(userId, completed.recoveryCodes[0]!), /already used|not valid/)
  } finally {
    await destroyTestDatabase(database)
  }
})
