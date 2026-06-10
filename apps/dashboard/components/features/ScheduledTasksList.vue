<script setup lang="ts">
defineProps<{
  tasks: Array<{
    id: string
    label: string
    description: string
    scheduledFor: string
    status: 'scheduled'
  }>
}>()
</script>

<template>
  <ol class="scheduled-task-list">
    <li v-for="task in tasks" :key="task.id" class="scheduled-task-list__item">
      <div>
        <strong>{{ task.label }}</strong>
        <p>{{ task.description }}</p>
      </div>
      <time :datetime="task.scheduledFor">{{ new Date(task.scheduledFor).toLocaleString() }}</time>
    </li>
  </ol>
</template>

<style scoped>
.scheduled-task-list {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-0);
  margin: var(--space-0);
  list-style: none;
}

.scheduled-task-list__item {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-4);
  border: var(--border-default);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
}

.scheduled-task-list strong {
  font-size: var(--font-size-sm);
}

.scheduled-task-list p,
.scheduled-task-list time {
  margin-bottom: var(--space-0);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.scheduled-task-list time {
  color: var(--color-primary);
}
</style>
