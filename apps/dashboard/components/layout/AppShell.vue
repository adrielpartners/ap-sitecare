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
  min-height: 100vh;
  background: var(--gradient-background);
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
