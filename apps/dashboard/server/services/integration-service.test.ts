import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CloudflareClient } from '../integrations/cloudflare-client'
import { DropboxClient } from '../integrations/dropbox-client'
import { HostingerClient } from '../integrations/hostinger-client'

describe('Phase 9 external integrations', () => {
  it('normalizes an operational Cloudflare zone check', async () => {
    const client = new CloudflareClient('token', async () => new Response(JSON.stringify({
      success: true,
      result: [{ id: 'zone-id', name: 'example.com', status: 'active', paused: false }]
    }), { status: 200 }))
    const result = await client.inspect('example.com')
    assert.equal(result.state, 'healthy')
    assert.equal(result.details.zoneId, 'zone-id')
  })

  it('uses Cloudflare public DNS when an account token is not configured', async () => {
    const client = new CloudflareClient('', async () => new Response(JSON.stringify({
      Status: 0,
      Answer: [{ data: '192.0.2.1' }]
    }), { status: 200 }))
    const result = await client.inspect('example.com')
    assert.equal(result.state, 'healthy')
    assert.equal(result.details.mode, 'public-dns')
  })

  it('reports provider configuration gaps without making requests', async () => {
    const failFetch = async () => { throw new Error('should not fetch') }
    assert.equal((await new DropboxClient('', '', failFetch).inspect('example.com')).state, 'not-configured')
    assert.equal((await new HostingerClient('', '', failFetch).inspect()).state, 'not-configured')
  })
})
