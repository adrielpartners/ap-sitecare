<script setup lang="ts">
import siteCareSymbol from '~/assets/images/Symbol-SiteCare-600x600.png'

useHead({
  titleTemplate: title => title ? `${title} | SiteCare Operations` : 'SiteCare Operations Dashboard',
  link: [
    {
      rel: 'icon',
      type: 'image/png',
      href: siteCareSymbol
    }
  ]
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
