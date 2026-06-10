import { McpToolService } from './tool-service'

export const LATEST_PROTOCOL_VERSION = '2025-11-25'
const SUPPORTED_PROTOCOL_VERSIONS = new Set([LATEST_PROTOCOL_VERSION, '2025-03-26'])

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number
  method: string
  params?: Record<string, unknown>
}

const tools = [
  {
    name: 'list_sites',
    description: 'List managed sites with current operational health.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'get_site_health',
    description: 'Get the current health summary for a managed site.',
    inputSchema: { type: 'object', properties: { siteId: { type: 'string' } }, required: ['siteId'], additionalProperties: false }
  },
  {
    name: 'get_backup_status',
    description: 'Get the documented backup strategy for a managed site.',
    inputSchema: { type: 'object', properties: { siteId: { type: 'string' } }, required: ['siteId'], additionalProperties: false }
  },
  {
    name: 'get_site_notes',
    description: 'Get operational notes and risk context for a managed site.',
    inputSchema: { type: 'object', properties: { siteId: { type: 'string' } }, required: ['siteId'], additionalProperties: false }
  },
  {
    name: 'create_action_request',
    description: 'Create a reviewable action proposal. This never executes the action.',
    inputSchema: {
      type: 'object',
      properties: {
        siteId: { type: 'string' },
        actionType: { type: 'string' },
        rationale: { type: 'string' },
        requestedBy: { type: 'string' }
      },
      required: ['siteId', 'actionType', 'rationale'],
      additionalProperties: false
    }
  }
]

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${key} is required.`)
  return value
}

export class McpProtocolServer {
  constructor(private readonly service: McpToolService) {}

  async handle(request: JsonRpcRequest): Promise<Record<string, unknown> | null> {
    if (request.method.startsWith('notifications/')) return null
    try {
      if (request.method === 'initialize') {
        const requestedVersion = String(request.params?.protocolVersion ?? '')
        return this.success(request, {
          protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.has(requestedVersion)
            ? requestedVersion
            : LATEST_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: {
            name: 'ap-sitecare',
            title: 'AP SiteCare',
            version: '1.0.0',
            description: 'Inspection and proposal tools for managed WordPress operations.'
          },
          instructions: 'Inspect managed-site state and create reviewable proposals. No tool executes maintenance actions.'
        })
      }
      if (request.method === 'tools/list') return this.success(request, { tools })
      if (request.method === 'tools/call') {
        const name = requiredString(request.params ?? {}, 'name')
        const args = (request.params?.arguments ?? {}) as Record<string, unknown>
        const result = await this.callTool(name, args)
        const structuredContent = Array.isArray(result) ? { data: result } : result as Record<string, unknown>
        return this.success(request, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent
        })
      }
      return this.error(request, -32601, 'Method not found.')
    } catch (error) {
      return this.error(request, -32000, error instanceof Error ? error.message : 'Tool call failed.')
    }
  }

  private async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (name === 'list_sites') return this.service.listSites()
    if (name === 'get_site_health') return this.service.getSiteHealth(requiredString(args, 'siteId'))
    if (name === 'get_backup_status') return this.service.getBackupStatus(requiredString(args, 'siteId'))
    if (name === 'get_site_notes') return this.service.getSiteNotes(requiredString(args, 'siteId'))
    if (name === 'create_action_request') {
      return this.service.createActionRequest(
        requiredString(args, 'siteId'),
        requiredString(args, 'actionType'),
        requiredString(args, 'rationale'),
        typeof args.requestedBy === 'string' ? args.requestedBy : undefined
      )
    }
    throw new Error('Unknown MCP tool.')
  }

  private success(request: JsonRpcRequest, result: unknown): Record<string, unknown> {
    return { jsonrpc: '2.0', id: request.id ?? null, result }
  }

  private error(request: JsonRpcRequest, code: number, message: string): Record<string, unknown> {
    return { jsonrpc: '2.0', id: request.id ?? null, error: { code, message } }
  }
}
