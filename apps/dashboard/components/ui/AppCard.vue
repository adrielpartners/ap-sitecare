<script setup lang="ts">
withDefaults(defineProps<{
  interactive?: boolean
  muted?: boolean
}>(), {
  interactive: false,
  muted: false
})
</script>

<template>
  <article
    class="app-card"
    :class="{ 'app-card--interactive': interactive, 'app-card--muted': muted }"
  >
    <slot />
  </article>
</template>

<style scoped>
.app-card {
  padding: var(--space-5);
  border: var(--border-default);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.app-card--muted {
  background: var(--color-surface-muted);
  box-shadow: none;
}

.app-card--interactive {
  transition:
    border-color var(--motion-base) var(--ease-standard),
    box-shadow var(--motion-base) var(--ease-standard),
    transform var(--motion-base) var(--ease-standard);
}

.app-card--interactive:hover {
  border-color: var(--color-border-strong);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}
</style>

