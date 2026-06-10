<script setup lang="ts">
withDefaults(defineProps<{
  disabled?: boolean
  loading?: boolean
  to?: string
  type?: 'button' | 'submit' | 'reset'
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger'
}>(), {
  disabled: false,
  loading: false,
  to: undefined,
  type: 'button',
  variant: 'primary'
})
</script>

<template>
  <NuxtLink
    v-if="to"
    class="app-button"
    :class="`app-button--${variant}`"
    :to="to"
  >
    <span v-if="loading" class="app-button__spinner" aria-hidden="true" />
    <slot />
  </NuxtLink>
  <button
    v-else
    class="app-button"
    :class="`app-button--${variant}`"
    :disabled="disabled || loading"
    :type="type"
  >
    <span v-if="loading" class="app-button__spinner" aria-hidden="true" />
    <slot />
  </button>
</template>

<style scoped>
.app-button {
  display: inline-flex;
  min-height: 2.625rem;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border: var(--border-default);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-tight);
  text-decoration: none;
  transition:
    background-color var(--motion-fast) var(--ease-standard),
    border-color var(--motion-fast) var(--ease-standard),
    color var(--motion-fast) var(--ease-standard),
    transform var(--motion-fast) var(--ease-standard);
}

.app-button:active:not(:disabled) {
  transform: translateY(1px);
}

.app-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.app-button--primary {
  border-color: var(--color-primary);
  background: var(--gradient-primary);
  box-shadow: var(--glow-primary);
  color: var(--color-text);
}

.app-button--primary:hover:not(:disabled) {
  border-color: var(--color-primary-hover);
  background: var(--gradient-primary);
  color: var(--color-text);
  transform: translateY(-1px);
}

.app-button--secondary {
  background: var(--color-surface-muted);
  color: var(--color-text);
}

.app-button--secondary:hover:not(:disabled),
.app-button--quiet:hover:not(:disabled) {
  background: var(--color-surface-muted);
  border-color: var(--color-border-strong);
}

.app-button--quiet {
  border-color: transparent;
  background: transparent;
  color: var(--color-text-muted);
}

.app-button--danger {
  border-color: var(--color-danger);
  background: var(--color-danger);
  color: var(--color-surface);
}

.app-button--danger:hover:not(:disabled) {
  background: var(--color-danger-soft);
  border-color: var(--color-danger);
}

.app-button__spinner {
  width: 0.875rem;
  height: 0.875rem;
  border: var(--border-width) solid currentColor;
  border-right-color: transparent;
  border-radius: var(--radius-pill);
  animation: spin var(--motion-slow) linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
