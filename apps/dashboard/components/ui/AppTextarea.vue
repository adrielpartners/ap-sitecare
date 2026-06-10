<script setup lang="ts">
defineOptions({ inheritAttrs: false })
defineProps<{ label: string, modelValue?: string, name: string, placeholder?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const inputId = useId()
</script>

<template>
  <div class="app-field">
    <label class="app-field__label" :for="inputId">{{ label }}</label>
    <textarea
      v-bind="$attrs"
      :id="inputId"
      class="app-field__control"
      :name="name"
      :placeholder="placeholder"
      :value="modelValue"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
  </div>
</template>

<style scoped>
.app-field { display: grid; gap: var(--space-2); }
.app-field__label { color: var(--color-text); font-size: var(--font-size-sm); font-weight: var(--font-weight-semibold); }
.app-field__control {
  width: 100%;
  min-height: 7rem;
  resize: vertical;
  padding: var(--space-3);
  border: var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
  color: var(--color-text);
}
</style>
