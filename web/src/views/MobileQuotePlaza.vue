<script setup lang="ts">
import { ref, computed, nextTick, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ArrowLeft } from '@element-plus/icons-vue';
import { ElSelect, ElOption } from 'element-plus';
import { fetchNovels } from '../api/novels';
import { fetchCharacters } from '../api/characters';
import { fetchCharacterGrowth, type CharacterQuote } from '../api/character-growth';
import type { NovelMetadata, CharacterProfile } from '../types';
import { useShareCard } from '../composables/useShareCard';
import '../styles/mobile-fun-features.css';

interface QuoteItem extends CharacterQuote {
  characterName: string;
  characterId: string;
}

const TABS = [
  { key: 'all', label: '金句总榜' },
  { key: 'hot', label: '热血向' },
  { key: 'dark', label: '毒舌向' },
  { key: 'sad', label: '虐心向' },
] as const;

const router = useRouter();
const route = useRoute();
const share = useShareCard();

const novels = ref<NovelMetadata[]>([]);
const novelId = ref<string>('');
const loading = ref(false);
const quotes = ref<QuoteItem[]>([]);
const activeTab = ref<string>('all');
const sharingIdx = ref(-1);

async function loadNovels() {
  try { novels.value = await fetchNovels(); } catch { /* ignore */ }
}

async function onNovelChange(id: string) {
  novelId.value = id; quotes.value = [];
  if (!id) return;
  loading.value = true;
  try {
    const chars = await fetchCharacters(id);
    const results = await Promise.allSettled(
      chars.map(async (c: CharacterProfile) => {
        const growth = await fetchCharacterGrowth(id, c.id);
        return growth.quotes.map(q => ({ ...q, characterName: c.name, characterId: c.id }));
      }),
    );
    const all: QuoteItem[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') all.push(...r.value);
    }
    all.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    quotes.value = all;
  } catch { /* ignore */ }
  finally { loading.value = false; }
}

// 简单关键词分类
const hotKeywords = /燃|热血|战斗|冲|突破|决不|必胜|杀|斩灭|无敌|碾压|崛起/;
const darkKeywords = /毒舌|嘲讽|冷笑|不屑|愚蠢|废物|白痴|找死|算什么|不过如此/;
const sadKeywords = /泪|痛|遗憾|错过|失去|离去|永别|如果|曾经|再也/;

const filteredQuotes = computed(() => {
  if (activeTab.value === 'all') return quotes.value;
  if (activeTab.value === 'hot') return quotes.value.filter(q => hotKeywords.test(q.text));
  if (activeTab.value === 'dark') return quotes.value.filter(q => darkKeywords.test(q.text));
  if (activeTab.value === 'sad') return quotes.value.filter(q => sadKeywords.test(q.text));
  return quotes.value;
});

async function doShare(q: QuoteItem, idx: number) {
  sharingIdx.value = idx;
  try {
    const novel = novels.value.find(n => n.id === novelId.value);
    const shareUrl = `${window.location.origin}/m/bookstore/${novelId.value}?from=quote-share`;
    const url = await share.generateCard({
      text: q.text,
      novelTitle: novel?.title ?? '',
      authorName: q.characterName,
      chapterTitle: `第${q.chapter}章 · 金句分 ${q.score}`,
      shareUrl,
      showQrPlaceholder: true,
    });
    if (url) await share.shareImage(url);
  } finally { sharingIdx.value = -1; }
}

loadNovels();

onMounted(async () => {
  await nextTick();
  window.scrollTo(0, 0);
  const initialNovelId = route.query.novelId as string | undefined;
  if (initialNovelId) {
    // 等 novels 加载完后自动选中
    const checkInterval = setInterval(() => {
      if (novels.value.length > 0) {
        clearInterval(checkInterval);
        const found = novels.value.find(n => n.id === initialNovelId);
        if (found) onNovelChange(initialNovelId);
      }
    }, 100);
    setTimeout(() => clearInterval(checkInterval), 3000);
  }
});
</script>

<template>
  <div class="mobile-fun-page">
    <div class="mf-topbar">
      <button class="mf-topbar__back" type="button" @click="router.back()">
        <el-icon :size="18"><ArrowLeft /></el-icon>
      </button>
      <span class="mf-topbar__title">金句广场</span>
    </div>

    <!-- 选择小说 -->
    <div class="mf-novel-select" style="margin:12px 0">
      <el-select v-model="novelId" placeholder="选择一部小说" clearable popper-class="mf-select-popper" style="width:100%" @change="onNovelChange">
        <el-option v-for="n in novels" :key="n.id" :label="n.title" :value="n.id" />
      </el-select>
    </div>

    <!-- 筛选 Tabs -->
    <div v-if="quotes.length > 0" class="mf-filter-bar">
      <button
        v-for="t in TABS" :key="t.key"
        class="mf-filter-chip"
        :class="{ 'mf-filter-chip--active': activeTab === t.key }"
        type="button"
        @click="activeTab = t.key"
      >{{ t.label }}</button>
    </div>

    <!-- 加载中 -->
    <div v-if="loading" class="mf-novel-empty">加载金句中...</div>

    <!-- 金句列表 -->
    <div v-else-if="filteredQuotes.length > 0" style="display:grid;gap:10px;margin-top:8px">
      <div
        v-for="(q, idx) in filteredQuotes"
        :key="`${q.characterId}-${q.chapter}-${idx}`"
        class="mf-card mf-quote-card"
      >
        <div class="mf-quote-card__text">{{ q.text }}</div>
        <div class="mf-quote-card__meta">
          <span class="mf-quote-card__score">⭐ {{ q.score }}</span>
          <span>— {{ q.characterName }}</span>
          <span style="margin-left:auto">第{{ q.chapter }}章</span>
        </div>
        <button
          class="mf-btn mf-btn--outline mf-btn--block"
          style="margin-top:6px;padding:8px 0;font-size:12px"
          :disabled="sharingIdx === idx"
          @click="doShare(q, idx)"
        >
          {{ sharingIdx === idx ? '生成中...' : '生成金句卡' }}
        </button>
      </div>
    </div>

    <div v-if="novelId && !loading && quotes.length === 0" class="mf-novel-empty">
      <strong>暂无金句数据</strong> 这部小说还没有定稿，金句会在定稿时自动挖掘
    </div>
    <div v-if="!novelId" class="mf-novel-empty" style="margin-top:40px">
      <strong>金句广场</strong> 选一部小说，探索每个角色最精彩的名场面台词
    </div>
  </div>
</template>
