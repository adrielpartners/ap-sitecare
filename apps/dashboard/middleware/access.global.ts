const publicPages = new Set(['/login', '/forgot-password', '/reset-password', '/invitation'])

export default defineNuxtRouteMiddleware(async (to) => {
  if (publicPages.has(to.path)) return
  const { data, error } = await useFetch('/api/session', { key: 'sitecare-session' })
  if (error.value || !data.value?.user) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }
  const role = data.value.user.role
  if (role === 'client' && !['/portal', '/profile'].some(path => to.path.startsWith(path))) {
    return navigateTo('/portal')
  }
  if (role !== 'admin' && ['/users', '/clients', '/settings'].some(path => to.path.startsWith(path))) {
    return navigateTo('/')
  }
})
