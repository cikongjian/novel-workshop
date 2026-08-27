<script setup lang="ts">
import { computed } from 'vue';
import {
  Cellphone,
  Close,
  Coin,
  Delete,
  Postcard,
  SwitchButton,
} from '@element-plus/icons-vue';
import type { AdminUserListItem } from '../../api/auth';
import {
  formatAdminCreatorStatus,
  formatAdminDate,
  formatAdminDateTime,
  formatAdminUserStatus,
  formatAdminWords,
  getAdminUserInitial,
} from '../../utils/mobile-admin-user-format';

const props = defineProps<{
  user: AdminUserListItem;
}>();

const emit = defineEmits<{
  close: [];
  adjust: [user: AdminUserListItem];
  adjustQuota: [user: AdminUserListItem];
  toggleStatus: [user: AdminUserListItem];
  deleteUser: [user: AdminUserListItem];
}>();

const roleLabel = computed(() => (props.user.role === 'admin' ? '管理员' : '用户'));
const userInitial = computed(() => getAdminUserInitial(props.user.username));
const userStatusLabel = computed(() => formatAdminUserStatus(props.user.status));
const creatorStatusLabel = computed(() => formatAdminCreatorStatus(props.user.creatorStatus));
const totalWords = computed(() => formatAdminWords(props.user.totalGeneratedWords));
const createdAt = computed(() => formatAdminDate(props.user.createdAt));
const lastLoginAt = computed(() => formatAdminDateTime(props.user.lastLoginAt));

const userStatusClass = computed(() => [
  'mas-status-pill',
  props.user.status === 'disabled' ? 'mas-status-pill--danger' : 'mas-status-pill--success',
]);

const creatorStatusClass = computed(() => [
  'mas-status-pill',
  props.user.creatorStatus === 'approved' ? 'mas-status-pill--accent' : '',
  props.user.creatorStatus === 'pending' ? 'mas-status-pill--warning' : '',
  ['rejected', 'suspended'].includes(props.user.creatorStatus) ? 'mas-status-pill--danger' : '',
]);

function handleAdjust() {
  emit('adjust', props.user);
}

function handleAdjustQuota() {
  emit('adjustQuota', props.user);
}

function handleToggleStatus() {
  emit('toggleStatus', props.user);
}

function handleDelete() {
  emit('deleteUser', props.user);
}
</script>

<template>
  <div class="mas-overlay mas-overlay--detail" @click.self="emit('close')">
    <section
      class="mas-sheet mas-sheet--profile"
      role="dialog"
      aria-modal="true"
      :aria-label="`${user.username} 用户详情`"
    >
      <header class="mas-profile-hero">
        <div class="mas-profile-hero__top">
          <span class="mas-profile-avatar" aria-hidden="true">{{ userInitial }}</span>

          <div class="mas-profile-identity">
            <span class="mas-profile-kicker">用户档案</span>
            <h2>{{ user.username }}</h2>
            <div class="mas-profile-badges">
              <span :class="userStatusClass">{{ userStatusLabel }}</span>
              <span class="mas-status-pill mas-status-pill--neutral">{{ roleLabel }}</span>
              <span :class="creatorStatusClass">{{ creatorStatusLabel }}</span>
            </div>
          </div>

          <button class="mas-icon-close" type="button" aria-label="关闭用户详情" @click="emit('close')">
            <el-icon :size="18"><Close /></el-icon>
          </button>
        </div>

        <div class="mas-profile-id">
          <span>用户 ID</span>
          <strong>{{ user.id }}</strong>
        </div>
      </header>

      <div class="mas-sheet__body mas-profile-body">
        <section class="mas-profile-metrics" aria-label="用户关键数据">
          <article class="mas-profile-metric">
            <span>积分余额</span>
            <strong>{{ (user.balancePoints || 0).toLocaleString() }}</strong>
          </article>
          <article class="mas-profile-metric mas-profile-metric--quota">
            <span>剩余免费字数</span>
            <strong>{{ (user.quotaRemaining || 0).toLocaleString() }}</strong>
            <em>上限 {{ (user.quotaTotal || 0).toLocaleString() }}</em>
          </article>
          <article class="mas-profile-metric">
            <span>累计生成</span>
            <strong>{{ totalWords }}</strong>
          </article>
          <article class="mas-profile-metric">
            <span>注册时间</span>
            <strong>{{ createdAt }}</strong>
          </article>
          <article class="mas-profile-metric">
            <span>最近登录</span>
            <strong>{{ lastLoginAt }}</strong>
          </article>
        </section>

        <section class="mas-profile-section">
          <div class="mas-profile-section__head">
            <span>基础资料</span>
          </div>
          <div class="mas-profile-info-list">
            <div class="mas-profile-info-row">
              <span class="mas-profile-info-icon" aria-hidden="true">
                <el-icon :size="16"><Postcard /></el-icon>
              </span>
              <label>笔名</label>
              <strong>{{ user.penName || '暂未设置' }}</strong>
            </div>
            <div class="mas-profile-info-row">
              <span class="mas-profile-info-icon" aria-hidden="true">
                <el-icon :size="16"><Cellphone /></el-icon>
              </span>
              <label>手机号</label>
              <strong>{{ user.phone || '未绑定' }}</strong>
            </div>
          </div>
        </section>

      </div>

      <footer class="mas-profile-actions">
        <button class="mas-action-btn mas-action-btn--primary" type="button" @click="handleAdjust">
          <el-icon :size="16"><Coin /></el-icon>
          <span>调整积分</span>
        </button>
        <button class="mas-action-btn" type="button" @click="handleAdjustQuota">
          <el-icon :size="16"><Postcard /></el-icon>
          <span>调免费字数</span>
        </button>
        <button class="mas-action-btn mas-action-btn--warn" type="button" @click="handleToggleStatus">
          <el-icon :size="15"><SwitchButton /></el-icon>
          <span>{{ user.status === 'active' ? '禁用' : '启用' }}</span>
        </button>
        <button class="mas-action-btn mas-action-btn--danger" type="button" @click="handleDelete">
          <el-icon :size="15"><Delete /></el-icon>
          <span>删除</span>
        </button>
      </footer>
    </section>
  </div>
</template>
