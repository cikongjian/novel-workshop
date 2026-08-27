<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import Icon from '../../components/shared/Icon.vue';
import {
  fetchAdminBillingConfig,
  saveAdminBillingConfig,
  type BillingSystemConfig,
  type BillingRule,
} from '../../api/billing';
import { extractApiErrorMessage } from '../../utils/api-error';

const activeTab = ref<'rules' | 'packages' | 'bindings' | 'trial'>('rules');

const loading = ref(false);
const saving = ref(false);
const config = ref<BillingSystemConfig | null>(null);

const editingRule = ref<BillingRule | null>(null);
const ruleDialogVisible = ref(false);

function categoryLabel(cat: string): string {
  const map: Record<string, string> = { generation: '生文', capability: '能力', package: '产品包' };
  return map[cat] ?? cat;
}

function chargeModeLabel(mode: string): string {
  const map: Record<string, string> = { per_1k_chars: '每千字', per_call: '每次', package: '整包' };
  return map[mode] ?? mode;
}

const generationRules = computed(() =>
  config.value?.rules.filter((r) => r.category === 'generation') ?? []
);
const capabilityRules = computed(() =>
  config.value?.rules.filter((r) => r.category === 'capability') ?? []
);
const packageRules = computed(() =>
  config.value?.rules.filter((r) => r.category === 'package') ?? []
);

const enabledRuleOptions = computed(() =>
  (config.value?.rules ?? []).filter((r) => r.enabled).map((r) => ({
    value: r.code,
    label: `${r.title} (${r.unitPricePoints}分)`,
  }))
);

async function loadConfig() {
  loading.value = true;
  try {
    config.value = await fetchAdminBillingConfig();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '加载计费配置失败'));
  } finally {
    loading.value = false;
  }
}

async function saveConfig() {
  if (!config.value) return;
  saving.value = true;
  try {
    await saveAdminBillingConfig(config.value);
    ElMessage.success('计费配置已保存');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '保存失败'));
  } finally {
    saving.value = false;
  }
}

function editRule(rule: BillingRule) {
  editingRule.value = { ...rule };
  ruleDialogVisible.value = true;
}

function saveRuleEdit() {
  if (!editingRule.value || !config.value) return;
  const idx = config.value.rules.findIndex((r) => r.code === editingRule.value!.code);
  if (idx >= 0) config.value.rules[idx] = editingRule.value;
  ruleDialogVisible.value = false;
  editingRule.value = null;
}

function toggleRule(rule: BillingRule) {
  rule.enabled = !rule.enabled;
}

onMounted(() => {
  void loadConfig();
});
</script>

<template>
  <div class="desktop-admin-billing">
    <div class="desktop-greeting">
      <h1>计费管理</h1>
      <p>配置积分单价、充值套餐和操作绑定规则。</p>
    </div>

    <!-- Tab 切换 -->
    <div class="nw-panel">
      <div class="billing-tabs">
        <button class="billing-tab" :class="{ 'is-active': activeTab === 'rules' }" @click="activeTab = 'rules'">
          计费规则
        </button>
        <button class="billing-tab" :class="{ 'is-active': activeTab === 'packages' }" @click="activeTab = 'packages'">
          充值套餐
        </button>
        <button class="billing-tab" :class="{ 'is-active': activeTab === 'bindings' }" @click="activeTab = 'bindings'">
          操作绑定
        </button>
        <button class="billing-tab" :class="{ 'is-active': activeTab === 'trial' }" @click="activeTab = 'trial'">
          免费试用
        </button>
        <div class="billing-tab-spacer"></div>
        <button class="desktop-btn desktop-btn--primary" :disabled="saving" @click="saveConfig">
          {{ saving ? '保存中…' : '保存配置' }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="nw-state nw-state--loading nw-panel">
      <span class="nw-state__spinner" />
      <span>加载中…</span>
    </div>

    <!-- 计费规则 -->
    <template v-if="config && activeTab === 'rules'">
      <!-- 基础设置 -->
      <div class="nw-panel">
        <div class="nw-panel__head">
          <h2 class="nw-panel__title">基础设置</h2>
        </div>
        <div class="form-grid">
          <div class="nw-field">
            <label class="nw-field-label">积分比例（分/元）</label>
            <input v-model.number="config.pointScale" type="number" min="10" max="1000" class="nw-input" />
          </div>
          <div class="nw-field">
            <label class="nw-field-label">注册赠送积分</label>
            <input v-model.number="config.signupGiftPoints" type="number" min="0" class="nw-input" />
          </div>
        </div>
      </div>

      <!-- 生文类 -->
      <div class="nw-panel">
        <div class="nw-panel__head">
          <h2 class="nw-panel__title">生文类规则</h2>
        </div>
        <div class="rule-list">
          <div v-for="rule in generationRules" :key="rule.code" class="rule-item">
            <div class="rule-info">
              <div class="rule-title">{{ rule.title }}</div>
              <div class="rule-desc">{{ rule.description }}</div>
              <div class="rule-meta">
                <span class="nw-tag">{{ chargeModeLabel(rule.chargeMode) }}</span>
                <span>{{ rule.unitPricePoints }} 积分</span>
              </div>
            </div>
            <div class="rule-actions">
              <label class="rule-toggle">
                <input type="checkbox" :checked="rule.enabled" @change="toggleRule(rule)" />
                <span class="rule-toggle-track" :class="{ on: rule.enabled }">
                  <span class="rule-toggle-thumb" />
                </span>
              </label>
              <button class="desktop-btn" @click="editRule(rule)">
                <Icon name="edit" :size="14" /> 编辑
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 能力类 -->
      <div class="nw-panel">
        <div class="nw-panel__head">
          <h2 class="nw-panel__title">能力类规则</h2>
        </div>
        <div class="rule-list">
          <div v-for="rule in capabilityRules" :key="rule.code" class="rule-item">
            <div class="rule-info">
              <div class="rule-title">{{ rule.title }}</div>
              <div class="rule-desc">{{ rule.description }}</div>
              <div class="rule-meta">
                <span class="nw-tag">{{ chargeModeLabel(rule.chargeMode) }}</span>
                <span>{{ rule.unitPricePoints }} 积分</span>
              </div>
            </div>
            <div class="rule-actions">
              <label class="rule-toggle">
                <input type="checkbox" :checked="rule.enabled" @change="toggleRule(rule)" />
                <span class="rule-toggle-track" :class="{ on: rule.enabled }">
                  <span class="rule-toggle-thumb" />
                </span>
              </label>
              <button class="desktop-btn" @click="editRule(rule)">
                <Icon name="edit" :size="14" /> 编辑
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- 充值套餐 -->
    <template v-if="config && activeTab === 'packages'">
      <div class="nw-panel">
        <div class="nw-panel__head">
          <h2 class="nw-panel__title">充值套餐</h2>
        </div>
        <div class="package-grid">
          <div v-for="pkg in config.rechargePackages" :key="pkg.id" class="package-card" :class="{ 'is-featured': pkg.featured }">
            <div class="package-head">
              <div class="package-title">{{ pkg.title }}</div>
              <div class="package-price">¥{{ pkg.amountCny }}</div>
            </div>
            <div class="package-points">
              <span class="points-value">{{ pkg.points }}</span>
              <span class="points-label">积分</span>
              <span v-if="pkg.bonusPoints" class="points-bonus">+{{ pkg.bonusPoints }} 赠送</span>
            </div>
            <p class="package-desc">{{ pkg.description }}</p>
            <div class="package-actions">
              <label class="package-toggle">
                <input type="checkbox" v-model="pkg.enabled" />
                <span>启用</span>
              </label>
              <label class="package-toggle">
                <input type="checkbox" v-model="pkg.featured" />
                <span>推荐</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- 操作绑定 -->
    <template v-if="config && activeTab === 'bindings'">
      <div class="nw-panel">
        <div class="nw-panel__head">
          <h2 class="nw-panel__title">操作绑定</h2>
          <p class="nw-panel__subtitle">将各功能操作与计费规则绑定</p>
        </div>
        <div class="form-grid">
          <div class="nw-field">
            <label class="nw-field-label">章节生成</label>
            <select v-model="config.operationBindings.generateChapterRuleCode" class="nw-input">
              <option v-for="opt in enabledRuleOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>
          <div class="nw-field">
            <label class="nw-field-label">章节修订</label>
            <select v-model="config.operationBindings.reviseChapterRuleCode" class="nw-input">
              <option v-for="opt in enabledRuleOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>
          <div class="nw-field">
            <label class="nw-field-label">章节扩写</label>
            <select v-model="config.operationBindings.resizeChapterRuleCode" class="nw-input">
              <option v-for="opt in enabledRuleOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>
          <div class="nw-field">
            <label class="nw-field-label">番外生成</label>
            <select v-model="config.operationBindings.sideStoryRuleCode" class="nw-input">
              <option v-for="opt in enabledRuleOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>
          <div class="nw-field">
            <label class="nw-field-label">角色对话</label>
            <select v-model="config.operationBindings.characterChatRuleCode" class="nw-input">
              <option v-for="opt in enabledRuleOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>
          <div class="nw-field">
            <label class="nw-field-label">灵感扩写</label>
            <select v-model="config.operationBindings.expandIdeaRuleCode" class="nw-input">
              <option v-for="opt in enabledRuleOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>
        </div>
      </div>
    </template>

    <!-- 免费试用 -->
    <template v-if="config && activeTab === 'trial'">
      <div class="nw-panel">
        <div class="nw-panel__head">
          <h2 class="nw-panel__title">免费试用策略</h2>
        </div>
        <div class="form-grid">
          <div class="nw-field">
            <label class="nw-field-label">注册赠送积分</label>
            <input v-model.number="config.freeTrial.signupGiftPoints" type="number" min="0" class="nw-input" />
          </div>
          <div class="nw-field">
            <label class="nw-field-label">首日最大字数</label>
            <input v-model.number="config.freeTrial.firstDayMaxChars" type="number" min="0" class="nw-input" />
          </div>
          <div class="nw-field">
            <label class="nw-field-label">首周最大字数</label>
            <input v-model.number="config.freeTrial.firstWeekMaxChars" type="number" min="0" class="nw-input" />
          </div>
          <div class="nw-field">
            <label class="nw-field-label">单章最大字数</label>
            <input v-model.number="config.freeTrial.singleChapterMaxChars" type="number" min="0" class="nw-input" />
          </div>
        </div>
      </div>
    </template>

    <!-- 编辑规则弹窗 -->
    <el-dialog v-model="ruleDialogVisible" title="编辑计费规则" width="480px">
      <div v-if="editingRule" class="rule-edit-form">
        <div class="nw-field">
          <label class="nw-field-label">规则名称</label>
          <input v-model="editingRule.title" class="nw-input" />
        </div>
        <div class="nw-field">
          <label class="nw-field-label">规则描述</label>
          <input v-model="editingRule.description" class="nw-input" />
        </div>
        <div class="nw-field">
          <label class="nw-field-label">计费方式</label>
          <select v-model="editingRule.chargeMode" class="nw-input">
            <option value="per_1k_chars">每千字</option>
            <option value="per_call">每次</option>
            <option value="package">整包</option>
          </select>
        </div>
        <div class="nw-field">
          <label class="nw-field-label">单价（积分）</label>
          <input v-model.number="editingRule.unitPricePoints" type="number" min="0" class="nw-input" />
        </div>
        <div class="nw-field">
          <label class="nw-field-label">最低消费（积分）</label>
          <input v-model.number="editingRule.minPoints" type="number" min="0" class="nw-input" />
        </div>
        <div class="nw-field">
          <label class="nw-field-label">
            <input type="checkbox" v-model="editingRule.enabled" />
            启用该规则
          </label>
        </div>
      </div>
      <template #footer>
        <button class="desktop-btn" @click="ruleDialogVisible = false">取消</button>
        <button class="desktop-btn desktop-btn--primary" @click="saveRuleEdit">保存</button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.desktop-admin-billing {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-5);
}

.billing-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: var(--nw-space-3) var(--nw-space-5);
}

.billing-tab {
  padding: 8px 18px;
  border-radius: var(--nw-radius-md);
  border: none;
  background: transparent;
  color: var(--nw-text-secondary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.billing-tab:hover {
  color: var(--nw-text-primary);
  background: var(--nw-bg-secondary);
}

.billing-tab.is-active {
  color: var(--nw-accent-strong);
  background: color-mix(in srgb, var(--nw-accent-start) 12%, transparent);
  font-weight: 600;
}

.billing-tab-spacer {
  flex: 1;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--nw-space-4);
  padding: var(--nw-space-5);
}

.rule-list {
  display: flex;
  flex-direction: column;
}

.rule-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--nw-space-4) var(--nw-space-5);
  border-bottom: 1px solid var(--nw-border);
}

.rule-item:last-child {
  border-bottom: none;
}

.rule-info {
  flex: 1;
}

.rule-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--nw-text-primary);
  margin-bottom: 4px;
}

.rule-desc {
  font-size: 13px;
  color: var(--nw-text-secondary);
  margin-bottom: 8px;
}

.rule-meta {
  display: flex;
  align-items: center;
  gap: var(--nw-space-3);
  font-size: 13px;
  color: var(--nw-text-muted);
}

.rule-actions {
  display: flex;
  align-items: center;
  gap: var(--nw-space-4);
}

.rule-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.rule-toggle input {
  display: none;
}

.rule-toggle-track {
  width: 40px;
  height: 22px;
  border-radius: 999px;
  background: var(--nw-bg-secondary);
  position: relative;
  transition: background 0.2s;
}

.rule-toggle-track.on {
  background: var(--nw-accent-strong);
}

.rule-toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s;
}

.rule-toggle-track.on .rule-toggle-thumb {
  transform: translateX(18px);
}

.package-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--nw-space-4);
  padding: var(--nw-space-5);
}

.package-card {
  padding: var(--nw-space-5);
  border: 1.5px solid var(--nw-border);
  border-radius: var(--nw-radius-lg);
  background: var(--nw-bg-primary);
  transition: all 0.2s;
}

.package-card.is-featured {
  border-color: var(--nw-accent-strong);
  background: color-mix(in srgb, var(--nw-accent-start) 6%, var(--nw-bg-primary));
}

.package-head {
  margin-bottom: var(--nw-space-3);
}

.package-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--nw-text-primary);
  margin-bottom: 4px;
}

.package-price {
  font-size: 24px;
  font-weight: 700;
  color: var(--nw-accent-strong);
  font-family: var(--nw-font-display);
}

.package-points {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: var(--nw-space-3);
}

.points-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--nw-text-primary);
  font-family: var(--nw-font-display);
}

.points-label {
  font-size: 14px;
  color: var(--nw-text-secondary);
}

.points-bonus {
  font-size: 12px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--nw-success) 12%, transparent);
  color: var(--nw-success);
  margin-left: 4px;
}

.package-desc {
  font-size: 13px;
  color: var(--nw-text-secondary);
  margin: 0 0 var(--nw-space-4) 0;
  line-height: 1.5;
}

.package-actions {
  display: flex;
  gap: var(--nw-space-4);
}

.package-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--nw-text-secondary);
  cursor: pointer;
}

.rule-edit-form {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-4);
}
</style>
