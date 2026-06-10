<script setup lang="ts">
defineProps<{
  description: string
  title: string
}>()
</script>

<template>
  <div class="app-empty-state">
    <div class="app-empty-state__mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
    <h2>{{ title }}</h2>
    <p>{{ description }}</p>
    <div v-if="$slots.actions" class="app-empty-state__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.app-empty-state {
  display: grid;
  justify-items: center;
  padding: var(--space-10) var(--space-6);
  text-align: center;
  border: var(--border-default);
  border-radius: var(--radius-lg);
  background: var(--color-surface-muted);
}

.app-empty-state__mark {
  display: grid;
  width: 3.25rem;
  height: 3.25rem;
  margin-bottom: var(--space-4);
  place-content: center;
  gap: var(--space-1);
  border: var(--border-default);
  border-radius: var(--radius-lg);
  background: var(--color-surface-muted);
  box-shadow: var(--glow-primary);
}

.app-empty-state__mark span {
  width: 1.25rem;
  height: var(--border-width);
  background: var(--color-text-subtle);
}

.app-empty-state h2 {
  margin-bottom: var(--space-2);
  font-size: var(--font-size-lg);
}

.app-empty-state p {
  max-width: 28rem;
  margin-bottom: var(--space-0);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.app-empty-state__actions {
  margin-top: var(--space-5);
}
</style>
