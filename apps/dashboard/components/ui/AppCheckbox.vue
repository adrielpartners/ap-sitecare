<script setup lang="ts">
defineProps<{
  description?: string
  disabled?: boolean
  label: string
  modelValue: boolean
  name: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const inputId = useId()
</script>

<template>
  <label class="app-checkbox" :for="inputId">
    <input
      :id="inputId"
      :checked="modelValue"
      :disabled="disabled"
      :name="name"
      type="checkbox"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    >
    <span>
      <strong>{{ label }}</strong>
      <small v-if="description">{{ description }}</small>
    </span>
  </label>
</template>

<style scoped>
.app-checkbox {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3);
  border: var(--border-default);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
  cursor: pointer;
}

.app-checkbox input {
  width: 1rem;
  height: 1rem;
  margin-top: var(--space-1);
  accent-color: var(--color-primary);
}

.app-checkbox span {
  display: grid;
  gap: var(--space-1);
}

.app-checkbox strong {
  font-size: var(--font-size-sm);
}

.app-checkbox small {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.app-checkbox:has(input:disabled) {
  cursor: not-allowed;
  opacity: 0.65;
}
</style>
