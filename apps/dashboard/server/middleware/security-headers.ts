export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname
  setResponseHeaders(event, {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': path.startsWith('/api/plugin/package-download/') ? 'cross-origin' : 'same-origin',
    'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
  })
  if (process.env.NODE_ENV === 'production') {
    setResponseHeader(event, 'strict-transport-security', 'max-age=31536000; includeSubDomains')
  }
})
