export interface SmsMessage {
  recipient: string
  text: string
}

export interface SmsProvider {
  send(message: SmsMessage): Promise<{ messageId: string }>
}

/**
 * Deliberately non-operational boundary for a future Twilio adapter. SMS MFA
 * remains unavailable until a reviewed provider implementation is supplied.
 */
export class DisabledSmsProvider implements SmsProvider {
  async send(_message: SmsMessage): Promise<{ messageId: string }> {
    throw new Error('SMS delivery is not enabled. Email is the configured MFA channel.')
  }
}

export interface TwilioSmsConfiguration {
  accountSid: string
  authToken: string
  fromNumber: string
}
