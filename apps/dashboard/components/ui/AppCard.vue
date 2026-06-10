<script setup lang="ts">
withDefaults(defineProps<{
  interactive?: boolean
  muted?: boolean
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
}>(), {
  interactive: false,
  muted: false,
  tone: 'neutral'
})
</script>

<template>
  <article
    class="app-card"
    :class="[`app-card--${tone}`, { 'app-card--interactive': interactive, 'app-card--muted': muted }]"
  >
    <slot />
  </article>
</template>

<style scoped>
.app-card {
  padding: var(--space-5);
  border: var(--border-card);
  border-radius: var(--radius-lg);
  background: var(--gradient-card);
  box-shadow: var(--shadow-card);
}

.app-card--muted {
  background: var(--gradient-card-muted);
  box-shadow: var(--shadow-sm);
}

.app-card--success {
  border-color: var(--color-success-border);
  background: var(--gradient-card-success);
  box-shadow: var(--shadow-card), var(--glow-success);
}

.app-card--warning {
  border-color: var(--color-warning-border);
  background: var(--gradient-card-warning);
  box-shadow: var(--shadow-card), var(--glow-warning);
}

.app-card--danger {
  border-color: var(--color-danger-border);
  background: var(--gradient-card-danger);
  box-shadow: var(--shadow-card), var(--glow-danger);
}

.app-card--info {
  border-color: var(--color-info-border);
  background: var(--gradient-card-info);
  box-shadow: var(--shadow-card), var(--glow-info);
}

.app-card--interactive {
  transition:
    border-color var(--motion-base) var(--ease-standard),
    box-shadow var(--motion-base) var(--ease-standard),
    transform var(--motion-base) var(--ease-standard);
}

.app-card--interactive:hover {
  border-color: var(--color-border-glow);
  box-shadow: var(--shadow-lg), var(--glow-primary);
  transform: translateY(-1px);
}
</style>
