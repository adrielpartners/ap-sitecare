<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  value: number
  description: string
  tone?: 'success' | 'warning' | 'danger' | 'neutral'
}>(), {
  tone: 'neutral'
})
</script>

<template>
  <AppCard class="app-stat-card" :class="`app-stat-card--${tone}`">
    <div class="app-stat-card__header">
      <span class="app-stat-card__indicator" aria-hidden="true" />
      <p>{{ label }}</p>
    </div>
    <strong class="app-stat-card__value">{{ value }}</strong>
    <p class="text-meta">{{ description }}</p>
  </AppCard>
</template>

<style scoped>
.app-stat-card {
  position: relative;
  overflow: hidden;
  min-height: 11rem;
}

.app-stat-card::after {
  position: absolute;
  right: -15%;
  bottom: -45%;
  width: 9rem;
  height: 9rem;
  border-radius: var(--radius-pill);
  background: currentColor;
  content: "";
  filter: blur(4rem);
  opacity: 0.12;
  pointer-events: none;
}

.app-stat-card__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
}

.app-stat-card__header p {
  margin-bottom: var(--space-0);
}

.app-stat-card__indicator {
  width: var(--space-2);
  height: var(--space-2);
  border-radius: var(--radius-pill);
  background: currentColor;
}

.app-stat-card__value {
  display: block;
  margin-block: var(--space-4) var(--space-2);
  color: var(--color-text);
  font-size: var(--font-size-stat);
  letter-spacing: var(--letter-spacing-tight);
  line-height: var(--line-height-tight);
}

.app-stat-card--success { color: var(--color-success); box-shadow: var(--shadow-md), var(--glow-success); }
.app-stat-card--warning { color: var(--color-warning); box-shadow: var(--shadow-md), var(--glow-warning); }
.app-stat-card--danger { color: var(--color-danger); box-shadow: var(--shadow-md), var(--glow-danger); }
.app-stat-card--neutral { color: var(--color-primary); }
</style>
