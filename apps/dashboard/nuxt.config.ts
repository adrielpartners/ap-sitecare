export default defineNuxtConfig({
  compatibilityDate: '2026-06-09',
  css: [
    '~/assets/styles/tokens.css',
    '~/assets/styles/base.css',
    '~/assets/styles/utilities.css'
  ],
  components: [
    {
      path: '~/components',
      pathPrefix: false
    }
  ],
  devtools: { enabled: false },
  nitro: {
    externals: {
      external: ['pg']
    }
  },
  runtimeConfig: {
    auth: {
      secureCookies: false,
      eventHashKey: '',
      sessionDays: 30
    },
    sitecareBaseUrl: 'http://localhost:3000',
    email: {
      provider: 'brevo',
      brevoApiKey: '',
      fromAddress: '',
      fromName: 'SiteCare',
      replyTo: '',
      webhookBearerToken: ''
    },
    integrations: {
      cloudflareApiToken: '',
      cloudflareApiBaseUrl: 'https://api.cloudflare.com/client/v4',
      cloudflareWebhookSecret: '',
      cloudflareAccountId: '',
      cloudflareWebhookDestinationId: '',
      cloudflareNotificationPolicyId: '',
      dropboxAccessToken: '',
      dropboxBackupRoot: '',
      hostingerApiBaseUrl: 'https://developers.hostinger.com',
      hostingerApiToken: ''
    },
    backups: {
      allowedLocalBaseDirectories: '',
      dropboxAccountLabel: '',
      dropboxEnabled: true,
      dropboxTokenStrategy: 'runtime-access-token'
    },
    credentialEncryptionKey: '',
    databaseUrl: 'postgresql://sitecare:sitecare@127.0.0.1:5432/sitecare'
  },
  typescript: {
    strict: true
  }
})
