<script setup lang="ts">
import BrandEmblem from '../brand/BrandEmblem.vue';

type HeaderMetric = {
  key: string;
  label: string;
  value: string | number;
  detail?: string;
};

defineProps<{
  eyebrow: string;
  title: string;
  subtitle: string;
  metrics?: HeaderMetric[];
}>();
</script>

<template>
  <section class="console-page-header">
    <div class="console-page-header__top">
      <div class="console-page-header__copy">
        <p class="console-page-header__eyebrow">
          <BrandEmblem :size="15" />
          <span>{{ eyebrow }}</span>
        </p>
        <h1 class="console-page-header__title">{{ title }}</h1>
        <p class="console-page-header__subtitle">{{ subtitle }}</p>
      </div>

      <div class="console-page-header__actions">
        <slot name="actions" />
      </div>
    </div>

    <div v-if="metrics && metrics.length > 0" class="console-page-header__metrics">
      <article
        v-for="item in metrics"
        :key="item.key"
        class="console-page-header__metric"
      >
        <span class="console-page-header__metric-label">{{ item.label }}</span>
        <strong class="console-page-header__metric-value">{{ item.value }}</strong>
        <span v-if="item.detail" class="console-page-header__metric-detail">{{ item.detail }}</span>
      </article>
    </div>
  </section>
</template>

<style scoped>
.console-page-header {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px 22px;
  border: 1px solid color-mix(in srgb, #38bdf8 24%, var(--nw-border));
  border-radius: 20px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, #38bdf8 10%, var(--nw-bg-secondary)),
      color-mix(in srgb, #14b8a6 6%, var(--nw-bg-secondary))
    );
  box-shadow: 0 12px 26px color-mix(in srgb, #38bdf8 12%, transparent);
}

.console-page-header__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.console-page-header__copy {
  min-width: 0;
  display: grid;
  gap: 8px;
}

.console-page-header__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: color-mix(in srgb, #38bdf8 72%, var(--nw-text-secondary));
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.console-page-header__title {
  margin: 0;
  font-family: var(--nw-font-display);
  font-size: clamp(26px, 3.4vw, 34px);
  line-height: 1.08;
  letter-spacing: -0.03em;
  color: var(--nw-text-primary);
}

.console-page-header__subtitle {
  margin: 0;
  max-width: 760px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--nw-text-secondary);
}

.console-page-header__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.console-page-header__actions :deep(.el-button) {
  min-height: 38px;
  border-radius: 12px;
}

.console-page-header__metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.console-page-header__metric {
  min-width: 0;
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, #38bdf8 22%, var(--nw-border));
  border-radius: 14px;
  background:
    linear-gradient(
      155deg,
      color-mix(in srgb, #38bdf8 10%, var(--nw-bg-card)),
      color-mix(in srgb, #14b8a6 6%, var(--nw-bg-card))
    );
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #ffffff 14%, transparent),
    0 8px 18px color-mix(in srgb, #38bdf8 10%, transparent);
}

.console-page-header__metric-label {
  font-size: 11px;
  color: color-mix(in srgb, #38bdf8 54%, var(--nw-text-muted));
}

.console-page-header__metric-value {
  font-size: clamp(24px, 3vw, 30px);
  line-height: 1;
  color: color-mix(in srgb, #38bdf8 84%, var(--nw-text-primary));
}

.console-page-header__metric-detail {
  font-size: 12px;
  color: var(--nw-text-secondary);
}

html.dark .console-page-header {
  background:
    linear-gradient(180deg, rgba(17, 40, 68, 0.96), rgba(12, 30, 54, 0.9));
  box-shadow: 0 14px 28px rgba(6, 14, 32, 0.34);
}

html.dark .console-page-header__metric {
  background:
    linear-gradient(155deg, rgba(17, 32, 58, 0.94), rgba(13, 34, 55, 0.9));
}

@media (max-width: 767px) {
  .console-page-header {
    padding: 16px;
    gap: 14px;
  }

  .console-page-header__top {
    flex-direction: column;
  }

  .console-page-header__actions {
    width: 100%;
    justify-content: flex-start;
  }

  .console-page-header__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
