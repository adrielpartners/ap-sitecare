<script setup lang="ts">
const props = defineProps<{
  status: 'healthy' | 'attention' | 'critical' | 'unknown'
}>()

const presentation = computed(() => ({
  healthy: { label: 'Healthy', tone: 'success' as const },
  attention: { label: 'Needs attention', tone: 'warning' as const },
  critical: { label: 'Critical', tone: 'danger' as const },
  unknown: { label: 'Unknown', tone: 'neutral' as const }
})[props.status])
</script>

<template>
  <AppBadge :tone="presentation.tone">{{ presentation.label }}</AppBadge>
</template>
