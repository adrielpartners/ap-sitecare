import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LATEST_PROTOCOL_VERSION, McpProtocolServer } from '../../mcp/protocol-server'
import { McpToolService } from '../../mcp/tool-service'
import { createTestDatabase, destroyTestDatabase } from '../testing/postgres-test-database'
import { ClientRegistryService } from './client-registry-service'

describe('Phase 11 MCP layer', () => {
  it('allows an MCP client to list tools, inspect sites, and create a proposal', async () => {
    const database = await createTestDatabase()
    const registry = new ClientRegistryService(database)
    const client = await registry.createClient('Example Client', 'owner@example.com')
    const site = await registry.registerManagedSite({
      name: 'Example',
      url: 'https://example.com',
      clientAccountId: client.id,
      planId: 'sitecare-core',
      actorIdentifier: 'owner@example.com',
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
    await destroyTestDatabase(database)
  })
})
