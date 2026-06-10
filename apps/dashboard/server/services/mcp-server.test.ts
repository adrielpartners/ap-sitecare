import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LATEST_PROTOCOL_VERSION, McpProtocolServer } from '../../mcp/protocol-server'
import { McpToolService } from '../../mcp/tool-service'
import { createDatabase } from '../utils/database'
import { SiteRepository } from '../repositories/site-repository'
import { AuditRepository } from '../repositories/audit-repository'
import { AuditService } from './audit-service'
import { SiteService } from './site-service'

describe('Phase 11 MCP layer', () => {
  it('allows an MCP client to list tools, inspect sites, and create a proposal', async () => {
    const database = createDatabase(':memory:')
    const sites = new SiteRepository(database)
    const site = new SiteService(sites, new AuditService(new AuditRepository(database))).create({
      name: 'Example',
      url: 'https://example.com',
      backupStrategy: 'Daily',
      notes: 'Monitor checkout carefully.'
    })
    const server = new McpProtocolServer(new McpToolService(database))

    const initialized = await server.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: LATEST_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'test-agent', version: '1.0.0' } }
    })
    assert.equal((initialized?.result as { serverInfo: { name: string } }).serverInfo.name, 'ap-sitecare')
    assert.equal((initialized?.result as { protocolVersion: string }).protocolVersion, LATEST_PROTOCOL_VERSION)

    const listed = await server.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    assert.equal(((listed?.result as { tools: unknown[] }).tools).length, 5)

    const proposal = await server.handle({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'create_action_request',
        arguments: { siteId: site.id, actionType: 'verify-backup', rationale: 'Confirm latest backup.' }
      }
    })
    assert.equal((proposal?.result as { structuredContent: { status: string } }).structuredContent.status, 'pending')
    database.close()
  })
})
