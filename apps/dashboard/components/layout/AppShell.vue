<script setup lang="ts">
defineProps<{
  email?: string
}>()
</script>

<template>
  <div class="app-shell">
    <AppHeader :email="email" />
    <div class="app-shell__body">
      <AppSidebar />
      <main class="app-shell__content">
        <slot />
      </main>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  position: relative;
  isolation: isolate;
  min-height: 100vh;
  background: var(--gradient-background);
}

.app-shell::before,
.app-shell::after {
  position: fixed;
  z-index: -1;
  border-radius: var(--radius-pill);
  content: "";
  pointer-events: none;
}

.app-shell::before {
  top: calc(var(--layout-header-height) * -1);
  right: 4%;
  width: 58rem;
  height: 34rem;
  background: var(--gradient-atmosphere-primary);
}

.app-shell::after {
  top: 18rem;
  left: 26%;
  width: 42rem;
  height: 32rem;
  background: var(--gradient-atmosphere-cyan);
}

.app-shell__body {
  display: grid;
  grid-template-columns: var(--layout-navigation-width) minmax(0, 1fr);
}

.app-shell__content {
  width: 100%;
  max-width: var(--layout-content-max);
  padding: var(--space-10) var(--space-10) var(--space-16);
}

@media (max-width: 64rem) {
  .app-shell__content {
    padding: var(--space-8) var(--space-6);
  }
}

@media (max-width: 52rem) {
  .app-shell__body {
    grid-template-columns: minmax(0, 1fr);
  }

  .app-shell__content {
    padding: var(--space-6) var(--space-4);
  }
}
</style>
