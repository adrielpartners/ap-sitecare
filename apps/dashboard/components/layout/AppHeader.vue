<script setup lang="ts">
defineProps<{
  email?: string
}>()
</script>

<template>
  <header class="app-header">
    <div class="app-header__brand">
      <span class="app-header__brand-mark" aria-hidden="true">AP</span>
      <div>
        <strong>SiteCare</strong>
        <span>Operations</span>
      </div>
    </div>
    <div class="app-header__context">
      <span class="app-header__status" aria-label="System operational">
        <span aria-hidden="true" />
        Operational
      </span>
      <span v-if="email" class="app-header__identity">{{ email }}</span>
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
  background: var(--color-surface);
}

.app-header__brand,
.app-header__context,
.app-header__status {
  display: flex;
  align-items: center;
}

.app-header__brand {
  gap: var(--space-3);
}

.app-header__brand-mark {
  display: grid;
  width: 2.25rem;
  height: 2.25rem;
  place-items: center;
  border-radius: var(--radius-md);
  background: var(--color-text);
  color: var(--color-surface);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--letter-spacing-wide);
}

.app-header__brand div {
  display: grid;
  line-height: var(--line-height-tight);
}

.app-header__brand strong {
  font-weight: var(--font-weight-semibold);
}

.app-header__brand div span {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.app-header__context {
  gap: var(--space-4);
}

.app-header__status {
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
}

.app-header__identity {
  padding-left: var(--space-4);
  border-left: var(--border-default);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

@media (max-width: 42rem) {
  .app-header {
    height: auto;
    min-height: var(--layout-header-height);
    padding-inline: var(--space-4);
  }

  .app-header__identity {
    display: none;
  }
}
</style>

