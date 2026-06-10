<script setup lang="ts">
const route = useRoute()
const items = [
  { label: 'Dashboard', to: '/' },
  { label: 'Clients', to: '/clients' },
  { label: 'Sites', to: '/sites' },
  { label: 'Reports', to: '/reports' },
  { label: 'Security', to: '/security' },
  { label: 'Updates', to: '/updates' },
  { label: 'Backups', to: '/backups' },
  { label: 'Alerts', to: '/alerts' },
  { label: 'Settings', to: '/settings' }
]

function isActive(to: string): boolean {
  return to === '/' ? route.path === '/' : route.path.startsWith(to)
}
</script>

<template>
  <aside class="app-sidebar">
    <nav class="app-sidebar__navigation" aria-label="Primary navigation">
      <p class="app-sidebar__label">Operations</p>
      <NuxtLink
        v-for="item in items"
        :key="item.label"
        class="app-sidebar__item"
        :class="{ 'app-sidebar__item--active': isActive(item.to) }"
        :to="item.to"
        :aria-current="isActive(item.to) ? 'page' : undefined"
      >
        <span class="app-sidebar__indicator" aria-hidden="true" />
        {{ item.label }}
      </NuxtLink>
    </nav>
    <section class="app-sidebar__quick-actions">
      <p class="app-sidebar__label">Quick actions</p>
      <QuickActions />
    </section>
  </aside>
</template>

<style scoped>
.app-sidebar {
  position: sticky;
  z-index: var(--z-navigation);
  top: var(--layout-header-height);
  display: flex;
  height: calc(100vh - var(--layout-header-height));
  flex-direction: column;
  padding: var(--space-5) var(--space-4);
  border-right: var(--border-default);
  background: var(--color-glass-sidebar);
  backdrop-filter: blur(18px);
}

.app-sidebar__navigation {
  display: grid;
  gap: var(--space-1);
}

.app-sidebar__label {
  margin: var(--space-0) var(--space-3) var(--space-3);
  color: var(--color-text-subtle);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: var(--letter-spacing-wide);
  text-transform: uppercase;
}

.app-sidebar__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border: var(--border-width) solid transparent;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  text-decoration: none;
  transition:
    background-color var(--motion-fast) var(--ease-standard),
    border-color var(--motion-fast) var(--ease-standard),
    color var(--motion-fast) var(--ease-standard),
    box-shadow var(--motion-fast) var(--ease-standard);
}

.app-sidebar__item:hover {
  border-color: var(--color-border);
  background: var(--color-surface-muted);
  color: var(--color-text);
}

.app-sidebar__item--active {
  border-color: var(--color-border-glow);
  background: var(--gradient-selected);
  box-shadow: var(--glow-primary);
  color: var(--color-primary-hover);
}

.app-sidebar__indicator {
  width: 0.4rem;
  height: 0.4rem;
  border-radius: var(--radius-pill);
  background: currentColor;
  opacity: 0.45;
}

.app-sidebar__item--active .app-sidebar__indicator {
  box-shadow: var(--glow-primary);
  opacity: 1;
}

.app-sidebar__quick-actions {
  margin-top: auto;
  padding: var(--space-4);
  border: var(--border-default);
  border-radius: var(--radius-lg);
  background: var(--gradient-surface);
  box-shadow: var(--shadow-md);
}

.app-sidebar__quick-actions .app-sidebar__label {
  margin-inline: var(--space-0);
}

@media (max-width: 52rem) {
  .app-sidebar {
    position: static;
    height: auto;
    overflow-x: auto;
    padding: var(--space-2) var(--space-4);
    border-right: 0;
    border-bottom: var(--border-default);
  }

  .app-sidebar__navigation {
    display: flex;
  }

  .app-sidebar__label,
  .app-sidebar__quick-actions {
    display: none;
  }

  .app-sidebar__item {
    flex: 0 0 auto;
  }
}
</style>
