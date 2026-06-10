<script setup lang="ts">
withDefaults(defineProps<{
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
}>(), {
  tone: 'neutral'
})
</script>

<template>
  <span class="app-badge" :class="`app-badge--${tone}`">
    <span class="app-badge__dot" aria-hidden="true" />
    <slot />
  </span>
</template>

<style scoped>
.app-badge {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  border: var(--border-default);
  border-radius: var(--radius-pill);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-heading);
}

.app-badge__dot {
  width: 0.375rem;
  height: 0.375rem;
  border-radius: var(--radius-pill);
  background: currentColor;
}

.app-badge--neutral {
  background: var(--color-surface-muted);
  color: var(--color-text-muted);
}

.app-badge--success {
  border-color: var(--color-success-border);
  background: var(--color-success-surface);
  color: var(--color-success);
}

.app-badge--warning {
  border-color: var(--color-warning-border);
  background: var(--color-warning-surface);
  color: var(--color-warning);
}

.app-badge--danger {
  border-color: var(--color-danger-border);
  background: var(--color-danger-surface);
  color: var(--color-danger);
}

.app-badge--info {
  border-color: var(--color-info-border);
  background: var(--color-info-surface);
  color: var(--color-info);
}
</style>
