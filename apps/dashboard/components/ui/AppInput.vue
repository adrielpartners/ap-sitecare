<script setup lang="ts">
defineOptions({ inheritAttrs: false })

withDefaults(defineProps<{
  description?: string
  error?: string
  label: string
  modelValue?: string
  name: string
  placeholder?: string
  type?: 'text' | 'email' | 'password' | 'url' | 'search'
}>(), {
  description: undefined,
  error: undefined,
  modelValue: '',
  placeholder: undefined,
  type: 'text'
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const inputId = useId()
</script>

<template>
  <div class="app-input">
    <label class="app-input__label" :for="inputId">{{ label }}</label>
    <input
      v-bind="$attrs"
      :id="inputId"
      class="app-input__control"
      :class="{ 'app-input__control--error': error }"
      :aria-describedby="description || error ? `${inputId}-help` : undefined"
      :aria-invalid="Boolean(error)"
      :name="name"
      :placeholder="placeholder"
      :type="type"
      :value="modelValue"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    >
    <p v-if="description || error" :id="`${inputId}-help`" class="app-input__help" :class="{ 'app-input__help--error': error }">
      {{ error || description }}
    </p>
  </div>
</template>

<style scoped>
.app-input {
  display: grid;
  gap: var(--space-2);
}

.app-input__label {
  color: var(--color-text);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
}

.app-input__control {
  width: 100%;
  min-height: 2.75rem;
  padding: var(--space-2) var(--space-3);
  border: var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
  color: var(--color-text);
  transition:
    border-color var(--motion-fast) var(--ease-standard),
    box-shadow var(--motion-fast) var(--ease-standard);
}

.app-input__control::placeholder {
  color: var(--color-text-subtle);
}

.app-input__control:hover {
  border-color: var(--color-primary);
}

.app-input__control:focus {
  border-color: var(--color-primary);
  box-shadow: var(--glow-primary);
}

.app-input__control--error {
  border-color: var(--color-danger);
}

.app-input__help {
  margin-bottom: var(--space-0);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.app-input__help--error {
  color: var(--color-danger);
}
</style>
