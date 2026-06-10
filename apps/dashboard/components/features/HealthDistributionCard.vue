<script setup lang="ts">
defineProps<{
  distribution: {
    healthy: number
    attention: number
    critical: number
    unknown: number
  }
  total: number
}>()
</script>

<template>
  <AppCard class="health-distribution">
    <div>
      <p class="eyebrow">Portfolio health</p>
      <h2>Site health distribution</h2>
    </div>
    <div class="health-distribution__body">
      <div
        class="health-distribution__chart"
        :style="{ '--healthy': `${distribution.healthy}%`, '--attention': `${distribution.attention}%`, '--critical': `${distribution.critical}%` }"
        role="img"
        :aria-label="`${distribution.healthy}% healthy, ${distribution.attention}% attention, ${distribution.critical}% critical, ${distribution.unknown}% unknown`"
      >
        <span><strong>{{ total }}</strong><small>sites</small></span>
      </div>
      <dl class="health-distribution__legend">
        <div><dt>Healthy</dt><dd>{{ distribution.healthy }}%</dd></div>
        <div><dt>Attention</dt><dd>{{ distribution.attention }}%</dd></div>
        <div><dt>Critical</dt><dd>{{ distribution.critical }}%</dd></div>
        <div><dt>Unknown</dt><dd>{{ distribution.unknown }}%</dd></div>
      </dl>
    </div>
  </AppCard>
</template>

<style scoped>
.health-distribution {
  min-height: 11rem;
}

.health-distribution h2 {
  margin-bottom: var(--space-0);
  font-size: var(--font-size-lg);
}

.health-distribution__body {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: var(--space-5);
  margin-top: var(--space-4);
}

.health-distribution__chart {
  position: relative;
  display: grid;
  width: 7.25rem;
  height: 7.25rem;
  place-items: center;
  border-radius: var(--radius-pill);
  background:
    conic-gradient(
      var(--color-success) 0 var(--healthy),
      var(--color-warning) var(--healthy) calc(var(--healthy) + var(--attention)),
      var(--color-danger) calc(var(--healthy) + var(--attention)) calc(var(--healthy) + var(--attention) + var(--critical)),
      var(--color-text-subtle) calc(var(--healthy) + var(--attention) + var(--critical)) 100%
    );
  box-shadow: var(--glow-primary);
}

.health-distribution__chart::before {
  position: absolute;
  width: 5rem;
  height: 5rem;
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  content: "";
}

.health-distribution__chart span {
  position: relative;
  z-index: 1;
  display: grid;
  text-align: center;
}

.health-distribution__chart strong {
  font-size: var(--font-size-xl);
  line-height: var(--line-height-tight);
}

.health-distribution__chart small {
  color: var(--color-text-muted);
}

.health-distribution__legend {
  display: grid;
  gap: var(--space-1);
  margin: var(--space-0);
}

.health-distribution__legend div {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.health-distribution__legend dd {
  margin: var(--space-0);
  color: var(--color-text);
  font-weight: var(--font-weight-semibold);
}

@media (max-width: 30rem) {
  .health-distribution__body {
    grid-template-columns: 1fr;
    justify-items: center;
  }

  .health-distribution__legend {
    width: 100%;
  }
}
</style>
