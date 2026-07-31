import type { EmailMessage, EmailProvider } from './types'

export interface BrevoEmailProviderOptions {
  apiKey: string
  fromAddress: string
  fromName: string
  replyTo: string
}

export class BrevoEmailProvider implements EmailProvider {
  constructor(private readonly options: BrevoEmailProviderOptions) {}

  async send(message: EmailMessage): Promise<{ messageId: string }> {
    if (!this.options.apiKey) throw new Error('Brevo API key is not configured.')
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': this.options.apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: {
          email: this.options.fromAddress,
          name: this.options.fromName
        },
        replyTo: this.options.replyTo ? { email: this.options.replyTo } : undefined,
        to: [{ email: message.recipientEmail, name: message.recipientName || undefined }],
        subject: message.subject,
        textContent: message.textContent,
        htmlContent: message.htmlContent,
        tags: message.trackingId ? ['sitecare', message.trackingId] : ['sitecare']
      })
    })
    if (!response.ok) {
      throw new Error(`Brevo rejected the email request with HTTP ${response.status}.`)
    }
    const body = await response.json() as { messageId?: string }
    if (!body.messageId) throw new Error('Brevo did not return a message identifier.')
    return { messageId: body.messageId }
  }
}
