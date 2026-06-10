<script setup lang="ts">
import operationsLogo from '~/assets/images/Logo-SiteCare-Operations-Light-320x90.png'

defineProps<{
  email?: string
}>()
</script>

<template>
  <header class="app-header">
    <NuxtLink class="app-header__brand" to="/" aria-label="SiteCare Operations Dashboard home">
      <img :src="operationsLogo" alt="SiteCare Operations Dashboard">
    </NuxtLink>
    <div class="app-header__context">
      <span class="app-header__status" aria-label="System operational">
        <span aria-hidden="true" />
        Operational
      </span>
      <AppIconButton label="Notifications" to="/alerts">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" /></svg>
      </AppIconButton>
      <span v-if="email" class="app-header__identity">
        <span class="app-header__avatar" aria-hidden="true">{{ email.slice(0, 1).toUpperCase() }}</span>
        {{ email }}
      </span>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  position: sticky;
  z-index: var(--z-header);
  top: 0;
  display: flex;
  height: var(--layout-header-height);
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-6);
  border-bottom: var(--border-default);
  background: var(--color-glass-header);
  backdrop-filter: blur(18px);
}

.app-header__brand,
.app-header__context,
.app-header__status {
  display: flex;
  align-items: center;
}

.app-header__brand {
  border-radius: var(--radius-sm);
  text-decoration: none;
}

.app-header__brand:focus-visible {
  outline: 0;
  box-shadow: var(--shadow-focus);
}

.app-header__brand img {
  display: block;
  width: var(--brand-operations-logo-width);
  height: auto;
}

.app-header__context {
  gap: var(--space-4);
}

.app-header__status {
  padding: var(--space-1) var(--space-3);
  border: var(--border-width) solid var(--color-success-border);
  border-radius: var(--radius-pill);
  background: var(--color-success-surface);
  box-shadow: var(--glow-success), inset 0 1px 0 var(--color-card-highlight);
  gap: var(--space-2);
  color: var(--color-success);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
}

.app-header__status span {
  width: 0.4rem;
  height: 0.4rem;
  border-radius: var(--radius-pill);
  background: var(--color-success);
  box-shadow: 0 0 12px currentColor;
}

.app-header__identity {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.app-header__avatar {
  display: grid;
  width: 2rem;
  height: 2rem;
  place-items: center;
  border: var(--border-default);
  border-radius: var(--radius-pill);
  background: var(--color-surface-selected);
  color: var(--color-primary);
  font-weight: var(--font-weight-bold);
}

.app-header svg {
  width: 1.1rem;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.75;
}

@media (max-width: 42rem) {
  .app-header {
    height: auto;
    min-height: var(--layout-header-height);
    padding-inline: var(--space-4);
  }

  .app-header__brand img {
    width: var(--brand-operations-logo-width-compact);
  }

  .app-header__identity {
    display: none;
  }
}
</style>
