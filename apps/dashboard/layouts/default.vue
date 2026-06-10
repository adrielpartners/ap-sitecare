<script setup lang="ts">
const { data: session } = await useFetch('/api/session')
</script>

<template>
  <AppShell :email="session?.user.email">
    <slot />
  </AppShell>
</template>
