<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  value: number
  description: string
  percentage?: number
  tone?: 'success' | 'warning' | 'danger' | 'info'
}>(), {
  percentage: undefined,
  tone: 'info'
})
</script>

<template>
  <AppCard class="app-stat-card" :class="`app-stat-card--${tone}`" :tone="tone">
    <div class="app-stat-card__icon" aria-hidden="true">
      <svg v-if="tone === 'success'" viewBox="0 0 24 24"><path d="M12 3 20 7v5c0 5-3.4 8-8 10-4.6-2-8-5-8-10V7l8-4Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></svg>
      <svg v-else-if="tone === 'warning'" viewBox="0 0 24 24"><path d="M12 4 21 20H3L12 4Z" /><path d="M12 9v5M12 17h.01" /></svg>
      <svg v-else-if="tone === 'danger'" viewBox="0 0 24 24"><path d="M12 3 20 7v5c0 5-3.4 8-8 10-4.6-2-8-5-8-10V7l8-4Z" /><path d="M12 8v5M12 16h.01" /></svg>
      <svg v-else viewBox="0 0 24 24"><path d="M4 19V9M10 19V5M16 19v-8M22 19H2" /></svg>
    </div>
    <div class="app-stat-card__content">
      <p class="app-stat-card__label">{{ label }}</p>
      <strong class="app-stat-card__value">{{ value }}</strong>
      <p class="app-stat-card__description">
        <strong v-if="percentage !== undefined">{{ percentage }}%</strong>
        {{ description }}
      </p>
    </div>
  </AppCard>
</template>

<style scoped>
.app-stat-card {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: var(--space-5);
  min-height: 11rem;
}

.app-stat-card__icon {
  display: grid;
  width: 3.75rem;
  height: 3.75rem;
  place-items: center;
  border: var(--border-width) solid currentColor;
  border-radius: var(--radius-lg);
  background: currentColor;
  box-shadow: var(--glow-primary);
}

.app-stat-card__icon::before {
  position: absolute;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: var(--radius-md);
  background: var(--color-surface);
  content: "";
  opacity: 0.82;
}

.app-stat-card__icon,
.app-stat-card__icon svg {
  position: relative;
}

.app-stat-card__icon svg {
  z-index: 1;
  width: 1.75rem;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.app-stat-card__label {
  margin-bottom: var(--space-2);
  color: currentColor;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--letter-spacing-wide);
  text-transform: uppercase;
}

.app-stat-card__value {
  display: block;
  margin-bottom: var(--space-2);
  color: var(--color-text);
  font-size: var(--font-size-stat);
  letter-spacing: var(--letter-spacing-tight);
  line-height: var(--line-height-tight);
}

.app-stat-card__description {
  margin-bottom: var(--space-0);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.app-stat-card__description strong {
  color: currentColor;
}

.app-stat-card--success { color: var(--color-success); }
.app-stat-card--warning { color: var(--color-warning); }
.app-stat-card--danger { color: var(--color-danger); }
.app-stat-card--info { color: var(--color-info); }

.app-stat-card--success .app-stat-card__icon { box-shadow: var(--glow-success); }
.app-stat-card--warning .app-stat-card__icon { box-shadow: var(--glow-warning); }
.app-stat-card--danger .app-stat-card__icon { box-shadow: var(--glow-danger); }
.app-stat-card--info .app-stat-card__icon { box-shadow: var(--glow-info); }

@media (max-width: 34rem) {
  .app-stat-card {
    grid-template-columns: 1fr;
  }
}
</style>
