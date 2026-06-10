<script setup lang="ts">
const { data: response } = await useFetch('/api/audit')
const events = computed(() => response.value?.data ?? [])
</script>

<template>
  <div>
    <header class="page-heading">
      <p class="eyebrow">Audit</p>
      <h1>Operational history</h1>
      <p>A traceable record of site lifecycle, credential, and reporting events.</p>
    </header>
    <AppPanel title="System audit log" :description="`${events.length} recorded events`">
      <AuditTimeline :events="events" />
    </AppPanel>
  </div>
</template>
