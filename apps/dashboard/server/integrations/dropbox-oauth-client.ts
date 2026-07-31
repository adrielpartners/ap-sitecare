import type { Fetcher } from './types'

const AUTHORIZE_URL = 'https://www.dropbox.com/oauth2/authorize'
const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token'

export class DropboxOAuthClient {
  constructor(
    private readonly appKey: string,
    private readonly appSecret: string,
    private readonly redirectUri: string,
    private readonly fetcher: Fetcher = fetch
  ) {}

  authorizationUrl(state: string): string {
    this.requireConfigured()
    const url = new URL(AUTHORIZE_URL)
    url.search = new URLSearchParams({
      client_id: this.appKey,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      token_access_type: 'offline',
      state
    }).toString()
    return url.toString()
  }

  async exchangeCode(code: string): Promise<{ refreshToken: string, accountId: string | null }> {
    this.requireConfigured()
    const response = await this.fetcher(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.appKey}:${this.appSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri
      }).toString(),
      signal: AbortSignal.timeout(30_000)
    })
    if (!response.ok) throw new Error('Dropbox rejected the authorization code. Start the connection again.')
    const body = await response.json() as { refresh_token?: string, account_id?: string }
    if (!body.refresh_token) throw new Error('Dropbox did not issue an offline refresh token.')
    return { refreshToken: body.refresh_token, accountId: body.account_id ?? null }
  }

  private requireConfigured(): void {
    if (!this.appKey || !this.appSecret || !this.redirectUri) {
      throw new Error('Dropbox OAuth app key, app secret, and redirect URI must be configured globally.')
    }
  }
}
