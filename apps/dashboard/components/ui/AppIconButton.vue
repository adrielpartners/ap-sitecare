<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  to?: string
  type?: 'button' | 'submit'
}>(), {
  to: undefined,
  type: 'button'
})
</script>

<template>
  <NuxtLink v-if="to" class="app-icon-button" :to="to" :aria-label="label" :title="label">
    <slot />
  </NuxtLink>
  <button v-else class="app-icon-button" :type="type" :aria-label="label" :title="label">
    <slot />
  </button>
</template>

<style scoped>
.app-icon-button {
  display: grid;
  width: 2.5rem;
  height: 2.5rem;
  place-items: center;
  border: var(--border-default);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
  color: var(--color-text-muted);
  cursor: pointer;
  text-decoration: none;
  transition:
    border-color var(--motion-fast) var(--ease-standard),
    background-color var(--motion-fast) var(--ease-standard),
    color var(--motion-fast) var(--ease-standard);
}

.app-icon-button:hover {
  border-color: var(--color-border-glow);
  background: var(--color-surface-selected);
  color: var(--color-primary-hover);
}
</style>
