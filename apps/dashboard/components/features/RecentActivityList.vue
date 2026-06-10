<script setup lang="ts">
defineProps<{
  activities: Array<{
    id: string
    siteName: string | null
    label: string
    createdAt: string
  }>
}>()
</script>

<template>
  <ol v-if="activities.length" class="activity-list">
    <li v-for="activity in activities" :key="activity.id" class="activity-list__item">
      <span class="activity-list__marker" aria-hidden="true" />
      <div>
        <strong>{{ activity.label }}</strong>
        <p>{{ activity.siteName ?? 'System activity' }}</p>
        <time :datetime="activity.createdAt">{{ new Date(activity.createdAt).toLocaleString() }}</time>
      </div>
    </li>
  </ol>
  <AppEmptyState
    v-else
    title="No recent activity"
    description="Real site, check-in, credential, backup, and security activity will appear here."
  />
</template>

<style scoped>
.activity-list {
  display: grid;
  gap: var(--space-5);
  padding: var(--space-0);
  margin: var(--space-0);
  list-style: none;
}

.activity-list__item {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-3);
}

.activity-list__marker {
  width: var(--space-2);
  height: var(--space-2);
  margin-top: var(--space-2);
  border-radius: var(--radius-pill);
  background: var(--color-primary);
  box-shadow: var(--glow-primary);
}

.activity-list strong {
  font-size: var(--font-size-sm);
}

.activity-list p,
.activity-list time {
  display: block;
  margin-bottom: var(--space-0);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}
</style>
