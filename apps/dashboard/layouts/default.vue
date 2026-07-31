<script setup lang="ts">
const { data: session } = await useFetch('/api/session')
</script>

<template>
  <AppShell
    :email="session?.user.email"
    :display-name="session?.user.displayName"
    :role="session?.user.role"
  >
    <slot />
  </AppShell>
</template>
