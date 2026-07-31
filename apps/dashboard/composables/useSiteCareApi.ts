interface SiteCareApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  headers?: HeadersInit
}

export function useSiteCareApi() {
  return async <Response = unknown>(request: string, options: SiteCareApiOptions = {}): Promise<Response> => {
    const method = String(options.method ?? 'GET').toUpperCase()
    const headers = new Headers(options.headers as HeadersInit | undefined)
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      const csrfToken = useCookie<string | null>('sitecare_csrf').value
      if (csrfToken) headers.set('x-sitecare-csrf', csrfToken)
    }
    return await ($fetch as (request: string, options: SiteCareApiOptions) => Promise<Response>)(
      request,
      { ...options, headers }
    )
  }
}
