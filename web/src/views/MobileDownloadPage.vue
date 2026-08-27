<template>
  <div class="mobile-download-page mobile-focus-page" :class="{ 'mobile-focus-page--dark': isDarkTheme, 'mobile-focus-page--warm-night': isWarmNight }">
    <MobileTopbar title="下载客户端" :show-back="true" />

    <div class="mobile-download-content">
      <div v-if="insideAndroidAppShell" class="mobile-download-notice">
        <el-alert type="success" :closable="false" show-icon>
          当前已在安卓客户端内打开。网页功能发布后会直接生效；只有原生壳更新时才需要重新安装 APK。
        </el-alert>
      </div>

      <div v-if="config.notice" class="mobile-download-notice">
        <el-alert type="info" :closable="false" show-icon>
          {{ config.notice }}
        </el-alert>
      </div>

      <div v-if="loading" class="mobile-download-loading">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>加载中...</span>
      </div>

      <div v-else-if="error" class="mobile-download-error">
        <el-alert type="error" :closable="false">{{ error }}</el-alert>
      </div>

      <div v-else class="mobile-download-list">
        <div v-for="item in config.items" :key="item.id" class="mobile-download-item">
          <div class="mobile-download-item-header">
            <button
              v-if="hasPrimaryAction(item)"
              type="button"
              class="mobile-download-platform-button"
              :aria-label="`打开 ${item.name} 下载`"
              :title="`打开 ${item.name} 下载`"
              @click="handlePrimaryAction(item)"
            >
              <component :is="getPlatformIcon(item.platform)" class="platform-icon" />
            </button>
            <div v-else class="mobile-download-platform-shell">
              <component :is="getPlatformIcon(item.platform)" class="platform-icon" />
            </div>
            <div class="mobile-download-item-info">
              <h3 class="item-name">{{ item.name }}</h3>
              <div class="item-meta">
                <span class="version">v{{ item.version }}</span>
                <span class="size">{{ item.fileSize }}</span>
              </div>
            </div>
          </div>
          <p class="item-desc">{{ item.description }}</p>
          <div class="mobile-download-item-actions">
            <el-button
              v-if="item.directUrl"
              type="primary"
              size="large"
              :icon="Download"
              @click.stop="handleDirectDownload(item.directUrl)"
            >
              直接下载
            </el-button>
            <el-button
              v-if="item.baiduPanUrl"
              size="large"
              :icon="Link"
              @click.stop="handleBaiduPan(item)"
            >
              百度网盘
            </el-button>
          </div>
        </div>
      </div>

      <div v-if="!loading && config.items.length === 0" class="mobile-download-empty">
        <el-empty description="暂无可用下载" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Download, Link, Loading } from '@element-plus/icons-vue';
import MobileTopbar from '../components/mobile-focus/MobileTopbar.vue';
import { useDownloadPage } from '../composables/useDownloadPage';
import { isAndroidAppShell } from '../utils/app-shell';
import { useThemeMode } from '../composables/useThemeMode';
import '../styles/download-page.css';

const { isDark: isDarkTheme, isWarmNight } = useThemeMode();

const {
  config,
  loading,
  error,
  getPlatformIcon,
  hasPrimaryAction,
  handleDirectDownload,
  handleBaiduPan,
  handlePrimaryAction,
} = useDownloadPage();

const insideAndroidAppShell = isAndroidAppShell();
</script>
