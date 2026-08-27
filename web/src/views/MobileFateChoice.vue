<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import MobileCreateNovelSheet from '../components/mobile-entry/MobileCreateNovelSheet.vue';
import { useThemeMode } from '../composables/useThemeMode';
import '../styles/mobile-fun-features.css';

const router = useRouter();
const { isDark: isDarkTheme, isWarmNight } = useThemeMode();
const createSheetVisible = ref(false);

function handleDoor(door: typeof DOORS[number]) {
  if (door.status === 'ready') {
    if (door.route) {
      void router.push(door.route);
    } else if (door.action === 'maliang') {
      createSheetVisible.value = true;
    }
  } else {
    ElMessage({ message: '功能即将开启，敬请期待', type: 'info', duration: 2000 });
  }
}

function handleCreatedDetail(payload: { novelId: string }) {
  createSheetVisible.value = false;
  void router.push({ path: `/m/novel/${payload.novelId}`, query: { compose: '1' } });
}

type DoorIconKind = 'pangu' | 'nuwa' | 'cangjie' | 'maliang';

type FateDoor = {
  key: string;
  title: string;
  subtitle: string;
  desc: string;
  route: string;
  iconKind: DoorIconKind;
  iconImageUrl?: string;
  status: 'ready' | 'soon';
  action?: 'maliang';
};

const DOORS: FateDoor[] = [
  {
    key: 'pangu',
    title: '盘古开天',
    subtitle: '一灵感，开出全篇首章',
    desc: '把你想写的内容交给脑洞大师，直接启动新书与首章',
    route: '/m/fun/pangu',
    iconKind: 'pangu',
    status: 'ready',
  },
  {
    key: 'dna',
    title: '女娲造人',
    subtitle: '测爽点，铸就主角人格',
    desc: '测出你的爽点 DNA，让 AI 捏出主角人格与开局命运',
    route: '/m/fun/dna',
    iconKind: 'nuwa',
    status: 'ready',
  },
  {
    key: 'cangjie',
    title: '仓颉造字',
    subtitle: '聊剧情，敲定故事核心',
    desc: '对话梳理世界观、冲突与关系，沉淀可执行的故事核心',
    route: '/m/fun/cangjie',
    iconKind: 'cangjie',
    status: 'ready',
  },
  {
    key: 'maliang',
    title: '神笔马良',
    subtitle: '开脑洞，填充细节笔墨',
    desc: '补齐书名、题材、设定与卖点，让开书更完整',
    route: '',
    iconKind: 'maliang',
    status: 'ready',
    action: 'maliang',
  },
];
</script>

<template>
  <div class="mobile-fun-page mobile-focus-page" :class="{ 'mobile-focus-page--dark': isDarkTheme, 'mobile-focus-page--warm-night': isWarmNight }">
    <div class="mf-topbar">
      <button class="mf-topbar__back" type="button" @click="router.back()">
        <el-icon :size="18"><ArrowLeft /></el-icon>
      </button>
      <span class="mf-topbar__title">命运仪式</span>
    </div>

    <div class="fate-choice-hero">
      <div class="fate-choice-hero__title">命运仪式</div>
      <div class="fate-choice-hero__subtitle">选择你的创作之道</div>
    </div>

    <div class="fate-door-list">
      <button
        v-for="door in DOORS" :key="door.key"
        class="mf-card fate-door-card"
        :class="{ 'fate-door-card--soon': door.status === 'soon' }"
        @click="handleDoor(door)"
      >
        <div class="fate-door-icon" :class="`fate-door-icon--${door.iconKind}`" aria-hidden="true">
          <img v-if="door.iconImageUrl" :src="door.iconImageUrl" alt="" class="fate-door-icon__image" />
          <svg v-else-if="door.iconKind === 'nuwa'" viewBox="0 0 64 64" class="fate-door-icon__svg">
            <path class="fate-door-icon__glow" d="M31.5 18.5c8.5 4.8 12.5 10.6 12.5 18.4 0 9.6-7 16.1-12.5 18.6C26 53 19 46.5 19 36.9c0-7.8 4-13.6 12.5-18.4Z" />
            <path d="M16.8 37.4c5.6 2 10.3 5.1 14.2 9.5" />
            <path d="M47.2 37.4c-5.6 2-10.3 5.1-14.2 9.5" />
            <path d="M23.5 27.6c2.3-3.7 5.1-6.5 8.5-8.4 3.4 1.9 6.2 4.7 8.5 8.4" />
            <path d="M32 14.2v7.5" />
          </svg>
          <svg v-else-if="door.iconKind === 'pangu'" viewBox="0 0 64 64" class="fate-door-icon__svg">
            <path class="fate-door-icon__glow" d="M14 45c8.2-2.9 14.1-8.6 17.6-17.2C35 36.4 41 42.1 50 45c-8.6 4.3-27.2 4.3-36 0Z" />
            <path d="M32 10.5v42" />
            <path d="M22.2 24.6 32 14.8l9.8 9.8" />
            <path d="M18.5 43.5c7.6-3.1 12.1-8.8 13.5-17.2 1.4 8.4 5.9 14.1 13.5 17.2" />
            <path d="M23.5 52.3h17" />
          </svg>
          <svg v-else-if="door.iconKind === 'cangjie'" viewBox="0 0 64 64" class="fate-door-icon__svg">
            <path class="fate-door-icon__glow" d="M18 17.5h28c2.8 0 5 2.2 5 5v28c0 2.8-2.2 5-5 5H18c-2.8 0-5-2.2-5-5v-28c0-2.8 2.2-5 5-5Z" />
            <path d="M20.5 20.5h23.2" />
            <path d="M20.5 32h23.2" />
            <path d="M20.5 43.5h23.2" />
            <path d="M32 14v35.5" />
            <path d="M45.2 16.8 51 11" />
            <path d="M49.8 24.2 56 24" />
            <path d="M43.8 9.5 44 4" />
          </svg>
          <svg v-else viewBox="0 0 64 64" class="fate-door-icon__svg">
            <path class="fate-door-icon__glow" d="M18.4 45.7c7.6-1.5 14.3-5.6 20.2-12.2l8.1 8.1c-6.6 5.9-10.7 12.6-12.2 20.2-4.8-5-10.2-10.4-16.1-16.1Z" />
            <path d="M17.4 46.6 38.1 25.9" />
            <path d="M36.2 24 42 18.2c1.9-1.9 5-1.9 6.9 0l.9.9c1.9 1.9 1.9 5 0 6.9L44 31.8" />
            <path d="M36.5 24.4 43.6 31.5" />
            <path d="M16.2 47.8c-1.4 3.6-1.8 6.8-1.2 9.7 2.9.6 6.1.2 9.7-1.2" />
            <path d="M22 13.5l1.8 4.2 4.2 1.8-4.2 1.8-1.8 4.2-1.8-4.2-4.2-1.8 4.2-1.8 1.8-4.2Z" />
          </svg>
        </div>
        <div class="fate-door-card__content">
          <div class="fate-door-card__title-row">
            <span class="fate-door-card__title">{{ door.title }}</span>
            <span v-if="door.status === 'soon'" class="fate-door-card__badge">即将开启</span>
          </div>
          <div class="fate-door-card__subtitle">{{ door.subtitle }}</div>
          <div class="fate-door-card__desc">{{ door.desc }}</div>
        </div>
      </button>
    </div>

    <MobileCreateNovelSheet v-model="createSheetVisible" @created-detail="handleCreatedDetail" />
  </div>
</template>
