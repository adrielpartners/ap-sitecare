<script setup lang="ts">
defineProps<{
  eyebrow: string
  title: string
  description: string
}>()
</script>

<template>
  <div>
    <header class="page-heading">
      <p class="eyebrow">{{ eyebrow }}</p>
      <h1>{{ title }}</h1>
      <p>{{ description }}</p>
    </header>
    <AppPanel title="Coming soon" description="This section is intentionally staged for a future implementation phase.">
      <AppEmptyState
        :title="`${title} is coming soon`"
        description="The route is ready and safe to navigate. No remote or destructive action is available here."
      />
    </AppPanel>
  </div>
</template>
