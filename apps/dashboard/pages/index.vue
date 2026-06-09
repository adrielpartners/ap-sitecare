<script setup lang="ts">
const { data: session } = await useFetch('/api/session')
</script>

<template>
  <main>
    <h1>AP SiteCare</h1>
    <p>Dashboard foundation is operational.</p>
    <p v-if="session">
      Signed in as {{ session.user.email }}
    </p>
  </main>
</template>

