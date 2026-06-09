<script setup lang="ts">
withDefaults(defineProps<{
  disabled?: boolean
  loading?: boolean
  type?: 'button' | 'submit' | 'reset'
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger'
}>(), {
  disabled: false,
  loading: false,
  type: 'button',
  variant: 'primary'
})
</script>

<template>
  <button
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
  background: var(--color-primary);
  color: var(--color-surface);
}

.app-button--primary:hover:not(:disabled) {
  border-color: var(--color-primary-hover);
  background: var(--color-primary-hover);
}

.app-button--secondary {
  background: var(--color-surface);
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
  background: var(--color-text);
  border-color: var(--color-text);
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

