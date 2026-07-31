import { createInterface } from 'node:readline'
import { createDatabase } from '../server/utils/database'
import { McpProtocolServer } from './protocol-server'
import { McpToolService } from './tool-service'

const database = createDatabase(
  process.env.NUXT_DATABASE_URL || 'postgresql://sitecare:sitecare@127.0.0.1:5432/sitecare',
  { applicationName: 'ap-sitecare-mcp' }
)
const server = new McpProtocolServer(new McpToolService(database))
const input = createInterface({ input: process.stdin })

input.on('line', async (line) => {
  try {
    const response = await server.handle(JSON.parse(line))
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`)
  } catch {
    process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error.' } })}\n`)
  }
})

input.on('close', () => {
  void database.close()
})
