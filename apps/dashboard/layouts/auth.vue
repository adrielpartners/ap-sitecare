<script setup lang="ts">
import siteCareLogo from '~/assets/images/Logo-SiteCare-Light-320x90.png'
</script>

<template>
  <main class="auth-layout">
    <section class="auth-layout__panel">
      <img :src="siteCareLogo" alt="SiteCare">
      <slot />
    </section>
  </main>
</template>

<style scoped>
.auth-layout {
  display: grid;
  min-height: 100vh;
  padding: var(--space-6);
  place-items: center;
  background: var(--gradient-background);
}

.auth-layout__panel {
  display: grid;
  width: min(100%, 30rem);
  gap: var(--space-6);
  padding: var(--space-8);
  border: var(--border-default);
  border-radius: var(--radius-xl);
  background: var(--gradient-card);
  box-shadow: var(--shadow-card), var(--glow-primary);
}

.auth-layout__panel img {
  width: min(100%, 15rem);
  height: auto;
}
</style>
