<script setup lang="ts">
/**
 * StatCard —— 跨设备共享的 KPI 指标卡
 * 大数字 + 小标签 + 图标 + 可选趋势提示。运营平台仪表盘通用件，桌面/移动共用。
 */
import '../../styles/shared.css';
import Icon from './Icon.vue';

withDefaults(
  defineProps<{
    label: string;
    value: string | number;
    icon?: string;
    hint?: string;
    accent?: 'indigo' | 'sky' | 'emerald' | 'amber';
  }>(),
  { icon: 'layers', accent: 'indigo' },
);
</script>

<template>
  <div class="nw-stat-card">
    <div class="nw-stat-card__icon" :class="`nw-stat-card__icon--${accent}`">
      <Icon :name="icon" :size="22" />
    </div>
    <div class="nw-stat-card__body">
      <div class="nw-stat-card__value">{{ value }}</div>
      <div class="nw-stat-card__label">{{ label }}</div>
    </div>
    <div v-if="hint" class="nw-stat-card__hint">{{ hint }}</div>
  </div>
</template>
