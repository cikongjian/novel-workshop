<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft, Share } from '@element-plus/icons-vue';
import { useAchievements } from '../composables/useAchievements';
import { useShareCard } from '../composables/useShareCard';
import { useThemeMode } from '../composables/useThemeMode';
import '../styles/mobile-achievements.css';

const router = useRouter();
const achievements = useAchievements();
const share = useShareCard();
const sharing = ref(false);
const { isDark: isDarkTheme, isWarmNight } = useThemeMode();

const categoryLabels: Record<string, string> = {
  reading: '阅读成长',
  explorer: '探索发现',
  social: '社交互动',
  special: '特别成就',
};

async function doShare() {
  sharing.value = true;
  try {
    const text = `我已获得 ${achievements.unlockedCount.value}/${achievements.totalCount.value} 枚阅读徽章\n继续解锁更多成就！`;
    const shareUrl = `${window.location.origin}/m/achievements?from=achievement-share`;
    const url = await share.generateCard({
      text,
      novelTitle: '阅读成就墙',
      authorName: '星文AI',
      chapterTitle: `已解锁 ${achievements.unlockedCount.value} 枚徽章`,
      shareUrl,
      showQrPlaceholder: true,
    });
    if (url) await share.shareImage(url);
  } finally { sharing.value = false; }
}

onMounted(() => {
  achievements.load();
  window.scrollTo(0, 0);
});
</script>

<template>
  <div class="mobile-achievements-page mobile-focus-page" :class="{ 'mobile-focus-page--dark': isDarkTheme, 'mobile-focus-page--warm-night': isWarmNight }">
    <div class="mobile-focus-shell">
      <div class="ma-topbar">
        <button class="ma-topbar__back" type="button" @click="router.back()">
          <el-icon :size="18"><ArrowLeft /></el-icon>
        </button>
        <span class="ma-topbar__title">我的成就</span>
        <button class="ma-topbar__action" type="button" @click="doShare">
          <el-icon :size="18"><Share /></el-icon>
        </button>
      </div>

      <div class="ma-header">
        <div class="ma-header__count">
          <span class="ma-header__number">{{ achievements.unlockedCount.value }}</span>
          <span class="ma-header__total">/{{ achievements.totalCount.value }}</span>
        </div>
        <p class="ma-header__label">已解锁徽章</p>
        <div class="ma-header__progress">
          <div
            class="ma-header__progress-bar"
            :style="{ width: `${(achievements.unlockedCount.value / achievements.totalCount.value) * 100}%` }"
          />
        </div>
      </div>

      <div
        v-for="(badges, category) in achievements.badgesByCategory.value"
        :key="category"
        class="ma-section"
      >
        <h3 class="ma-section__title">{{ categoryLabels[category] || category }}</h3>
        <div class="ma-badge-grid">
          <div
            v-for="badge in badges"
            :key="badge.id"
            class="ma-badge-card"
            :class="{ 'is-unlocked': badge.unlocked, [`is-${badge.rarity}`]: badge.unlocked }"
          >
            <div class="ma-badge-card__icon">{{ badge.unlocked ? badge.icon : '🔒' }}</div>
            <div class="ma-badge-card__name">{{ badge.name }}</div>
            <div class="ma-badge-card__desc">{{ badge.description }}</div>
            <div v-if="!badge.unlocked && badge.progress" class="ma-badge-card__progress">
              {{ badge.progress }}
            </div>
            <div v-if="badge.unlocked" class="ma-badge-card__rarity">
              {{ { common: '普通', rare: '稀有', epic: '史诗', legendary: '传说' }[badge.rarity] }}
            </div>
          </div>
        </div>
      </div>

      <div class="ma-footer">
        <p>继续阅读，解锁更多专属徽章 ✨</p>
      </div>
    </div>
  </div>
</template>
