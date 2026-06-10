<script setup lang="ts">
defineProps<{
  events: Array<{
    id: string
    eventType: string
    actorType: string
    actorIdentifier: string | null
    createdAt: string
  }>
}>()

function eventLabel(eventType: string): string {
  return eventType.split('.').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}
</script>

<template>
  <ol v-if="events.length" class="timeline">
    <li v-for="event in events" :key="event.id" class="timeline__event">
      <span class="timeline__marker" aria-hidden="true" />
      <div>
        <strong>{{ eventLabel(event.eventType) }}</strong>
        <p class="text-meta">
          {{ new Date(event.createdAt).toLocaleString() }} · {{ event.actorIdentifier ?? event.actorType }}
        </p>
      </div>
    </li>
  </ol>
  <AppEmptyState
    v-else
    title="No audit events yet"
    description="Important site and system activity will appear here."
  />
</template>

<style scoped>
.timeline {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-0);
  list-style: none;
}

.timeline__event {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-3);
}

.timeline__marker {
  width: var(--space-2);
  height: var(--space-2);
  margin-top: var(--space-2);
  border-radius: var(--radius-pill);
  background: var(--color-primary);
}
</style>
