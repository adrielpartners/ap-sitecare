<script setup lang="ts">
withDefaults(defineProps<{
  caption: string
  columns: string[]
}>(), {
  columns: () => []
})
</script>

<template>
  <div class="app-table-wrap">
    <table class="app-table">
      <caption>{{ caption }}</caption>
      <thead>
        <tr>
          <th v-for="column in columns" :key="column" scope="col">{{ column }}</th>
        </tr>
      </thead>
      <tbody>
        <slot />
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.app-table-wrap {
  overflow-x: auto;
  border: var(--border-default);
  border-radius: var(--radius-lg);
  background: var(--color-surface-muted);
}

.app-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.app-table caption {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.app-table th,
.app-table :deep(td) {
  padding: var(--space-3) var(--space-4);
  border-bottom: var(--border-default);
}

.app-table th {
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: var(--letter-spacing-wide);
  text-transform: uppercase;
}

.app-table :deep(td) {
  color: var(--color-text);
  font-size: var(--font-size-sm);
}

.app-table :deep(tbody tr:last-child td) {
  border-bottom: 0;
}

.app-table :deep(tbody tr:hover) {
  background: var(--color-surface-selected);
}
</style>
