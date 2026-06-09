<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  description?: string
}>(), {
  description: undefined
})
</script>

<template>
  <section class="app-panel">
    <header class="app-panel__header">
      <div>
        <h2>{{ title }}</h2>
        <p v-if="description">{{ description }}</p>
      </div>
      <slot name="actions" />
    </header>
    <div class="app-panel__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.app-panel {
  overflow: hidden;
  border: var(--border-default);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.app-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-5);
  border-bottom: var(--border-default);
}

.app-panel__header h2 {
  margin-bottom: var(--space-1);
  font-size: var(--font-size-lg);
}

.app-panel__header p {
  margin-bottom: var(--space-0);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.app-panel__body {
  padding: var(--space-5);
}
</style>

