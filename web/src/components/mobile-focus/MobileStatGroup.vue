<script setup lang="ts">
type StatItem = {
  label: string;
  value: string | number;
};

defineProps<{
  items: StatItem[];
}>();
</script>

<template>
  <div class="mobile-focus-metrics">
    <article v-for="item in items" :key="item.label" class="mobile-focus-metric">
      <strong>{{ item.value }}</strong>
      <span>{{ item.label }}</span>
    </article>
  </div>
</template>
