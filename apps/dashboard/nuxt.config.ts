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
      external: ['better-sqlite3']
    }
  },
  runtimeConfig: {
    auth: {
      developmentBypass: false,
      developmentEmail: 'developer@adrielpartners.com'
    },
    integrations: {
      cloudflareApiToken: '',
      dropboxAccessToken: '',
      dropboxBackupRoot: '',
      hostingerApiBaseUrl: '',
      hostingerApiToken: ''
    },
    backups: {
      allowedLocalBaseDirectories: '',
      dropboxAccountLabel: '',
      dropboxEnabled: true,
      dropboxTokenStrategy: 'runtime-access-token'
    },
    credentialEncryptionKey: '',
    databasePath: './data/sitecare.sqlite'
  },
  typescript: {
    strict: true
  }
})
