<template>
  <div class="quick-actions">
    <AppButton to="/sites/new">Add New Site</AppButton>
    <AppButton to="/check-ins" variant="secondary">Run Check-In</AppButton>
    <AppButton to="/reports" variant="secondary">Generate Report</AppButton>
  </div>
</template>

<style scoped>
.quick-actions {
  display: grid;
  gap: var(--space-2);
}

.quick-actions :deep(.app-button) {
  width: 100%;
  justify-content: flex-start;
}
</style>
