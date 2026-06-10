<script setup lang="ts">
const route = useRoute()
const items = [
  { label: 'Overview', to: '/' },
  { label: 'Sites', to: '/sites' },
  { label: 'Audit log', to: '/audit' },
  { label: 'Actions', to: '/actions' }
]

function isActive(to: string): boolean {
  return to === '/' ? route.path === '/' : route.path.startsWith(to)
}
</script>

<template>
  <nav class="app-navigation" aria-label="Primary navigation">
    <p class="app-navigation__label">Workspace</p>
    <NuxtLink
      v-for="item in items"
      :key="item.label"
      class="app-navigation__item"
      :class="{ 'app-navigation__item--active': isActive(item.to) }"
      :to="item.to"
      :aria-current="isActive(item.to) ? 'page' : undefined"
    >
      <span class="app-navigation__indicator" aria-hidden="true" />
      {{ item.label }}
    </NuxtLink>
    <div class="app-navigation__footer">
      <p>Observation first</p>
      <span>Proposals require review</span>
    </div>
  </nav>
</template>

<style scoped>
.app-navigation {
  position: sticky;
  z-index: var(--z-navigation);
  top: var(--layout-header-height);
  display: flex;
  height: calc(100vh - var(--layout-header-height));
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-6) var(--space-4);
  border-right: var(--border-default);
  background: var(--color-surface);
}

.app-navigation__label {
  margin: var(--space-0) var(--space-3) var(--space-3);
  color: var(--color-text-subtle);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: var(--letter-spacing-wide);
  text-transform: uppercase;
}

.app-navigation__item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  text-decoration: none;
  transition:
    background-color var(--motion-fast) var(--ease-standard),
    color var(--motion-fast) var(--ease-standard);
}

.app-navigation__item:hover {
  background: var(--color-surface-muted);
  color: var(--color-text);
}

.app-navigation__item--active {
  background: var(--color-surface-selected);
  color: var(--color-primary);
}

.app-navigation__indicator {
  width: 0.375rem;
  height: 0.375rem;
  border-radius: var(--radius-pill);
  background: currentColor;
  opacity: 0.45;
}

.app-navigation__item--active .app-navigation__indicator {
  opacity: 1;
}

.app-navigation__footer {
  margin-top: auto;
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
}

.app-navigation__footer p,
.app-navigation__footer span {
  margin-bottom: var(--space-0);
  font-size: var(--font-size-xs);
}

.app-navigation__footer p {
  color: var(--color-text);
  font-weight: var(--font-weight-semibold);
}

.app-navigation__footer span {
  color: var(--color-text-muted);
}

@media (max-width: 52rem) {
  .app-navigation {
    position: static;
    height: auto;
    flex-direction: row;
    overflow-x: auto;
    padding: var(--space-2) var(--space-4);
    border-right: 0;
    border-bottom: var(--border-default);
  }

  .app-navigation__label,
  .app-navigation__footer {
    display: none;
  }

  .app-navigation__item {
    flex: 0 0 auto;
  }
}
</style>
