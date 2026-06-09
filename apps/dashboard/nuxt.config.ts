export default defineNuxtConfig({
  compatibilityDate: '2026-06-09',
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
    databasePath: './data/sitecare.sqlite'
  },
  typescript: {
    strict: true
  }
})
