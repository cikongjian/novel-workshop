<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft, Coin } from '@element-plus/icons-vue';
import MobileTopbar from '../components/mobile-focus/MobileTopbar.vue';
import { useAuthStore } from '../stores/auth';
import { fetchAdminBillingConfig, saveAdminBillingConfig, type BillingSystemConfig, type BillingRule } from '../api/billing';
import { extractApiErrorMessage } from '../utils/api-error';
import { useThemeMode } from '../composables/useThemeMode';

const router = useRouter();
const { isDark: isDarkTheme, isWarmNight } = useThemeMode();
const { isAdmin } = useAuthStore();

const loading = ref(false);
const saving = ref(false);
const config = ref<BillingSystemConfig | null>(null);

// ── 规则分组 ──
function categoryLabel(cat: string) {
  const map: Record<string, string> = { generation: '生文', capability: '能力', package: '产品包' };
  return map[cat] ?? cat;
}

function chargeModeLabel(mode: string) {
  const map: Record<string, string> = { per_1k_chars: '每千字', per_call: '每次', package: '整包' };
  return map[mode] ?? mode;
}

// ── 绑定选项（所有 enabled 规则） ──
function getRuleOptions() {
  return (config.value?.rules ?? []).filter(r => r.enabled).map(r => ({ value: r.code, label: `${r.title} (${r.unitPricePoints}分)` }));
}

async function loadConfig() {
  loading.value = true;
  try {
    config.value = await fetchAdminBillingConfig();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '加载计费配置失败'));
  } finally { loading.value = false; }
}

async function saveConfig() {
  if (!config.value) return;
  saving.value = true;
  try {
    await saveAdminBillingConfig(config.value);
    ElMessage.success('计费配置已保存');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '保存失败'));
  } finally { saving.value = false; }
}

// ── 编辑规则弹层 ──
const editingRule = ref<BillingRule | null>(null);
function editRule(rule: BillingRule) { editingRule.value = { ...rule }; }
function closeRuleEdit() { editingRule.value = null; }
function saveRuleEdit() {
  if (!editingRule.value || !config.value) return;
  const idx = config.value.rules.findIndex(r => r.code === editingRule.value!.code);
  if (idx >= 0) config.value.rules[idx] = editingRule.value;
  closeRuleEdit();
}

const inputClass = 'mas-input';
const fieldClass = 'mas-field';
const saveBtnClass = 'mas-save';

onMounted(() => {
  if (isAdmin) void loadConfig();
  else router.replace('/m/app');
});

function goBack() { void router.push('/m/admin'); }
</script>

<template>
  <div v-if="isAdmin" class="mobile-admin-page mobile-focus-page" :class="{ 'mobile-focus-page--dark': isDarkTheme, 'mobile-focus-page--warm-night': isWarmNight }">
    <div class="mobile-focus-shell">
      <MobileTopbar title="计费规则" subtitle="积分单价与操作绑定">
        <template #leading>
          <button class="mobile-focus-button--ghost" type="button" @click="goBack">
            <el-icon :size="18"><ArrowLeft /></el-icon>
          </button>
        </template>
      </MobileTopbar>

      <main class="mobile-focus-main">
        <div v-if="loading" class="mobile-focus-loading">
          <el-skeleton animated :rows="6" />
        </div>

        <template v-if="config">
          <!-- 基础设置 -->
          <section class="mas-section">
            <h3 class="mas-section__title">基础设置</h3>
            <div :class="fieldClass"><label>积分比例（分/元）</label>
              <input v-model.number="config.pointScale" type="number" min="10" max="1000" :class="inputClass" />
            </div>
            <div :class="fieldClass"><label>注册赠送积分</label>
              <input v-model.number="config.freeTrial.signupGiftPoints" type="number" min="0" :class="inputClass" />
            </div>
            <div :class="fieldClass"><label>试用字数上限</label>
              <input v-model.number="config.trialQuotaChars" type="number" min="0" step="1000" :class="inputClass" />
            </div>
          </section>

          <!-- 消费绑定 -->
          <section class="mas-section">
            <h3 class="mas-section__title">消费绑定</h3>
            <div :class="fieldClass"><label>章节生成规则</label>
              <select v-model="config.operationBindings.generateChapterRuleCode" :class="inputClass">
                <option v-for="o in getRuleOptions()" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
            </div>
            <div :class="fieldClass"><label>章节修订规则</label>
              <select v-model="config.operationBindings.reviseChapterRuleCode" :class="inputClass">
                <option v-for="o in getRuleOptions()" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
            </div>
            <div :class="fieldClass"><label>章节扩缩规则</label>
              <select v-model="config.operationBindings.resizeChapterRuleCode" :class="inputClass">
                <option v-for="o in getRuleOptions()" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
            </div>
          </section>

          <!-- 积分规则列表 -->
          <section class="mas-section">
            <h3 class="mas-section__title">积分规则（{{ config.rules.length }} 条）</h3>
            <div class="mas-rule-list">
              <button
                v-for="rule in config.rules"
                :key="rule.code"
                class="mas-rule-card"
                :class="{ 'mas-rule-card--disabled': !rule.enabled }"
                type="button"
                @click="editRule(rule)"
              >
                <div class="mas-rule-card__top">
                  <span class="mas-rule-card__code">{{ rule.code }}</span>
                  <span :class="['mas-rule-card__cat', `mas-rule-cat--${rule.category}`]">{{ categoryLabel(rule.category) }}</span>
                </div>
                <div class="mas-rule-card__title">{{ rule.title }}</div>
                <div class="mas-rule-card__price">
                  <strong>{{ rule.unitPricePoints }}</strong> 分<span v-if="rule.chargeMode !== 'package'">/{{ chargeModeLabel(rule.chargeMode) }}</span>
                  <span v-if="rule.minPoints > 0" class="mas-rule-card__min">最低 {{ rule.minPoints }} 分</span>
                </div>
              </button>
            </div>
          </section>

          <!-- 底部保存 -->
          <button :class="saveBtnClass" :disabled="saving" @click="saveConfig">
            <el-icon :size="14"><Coin /></el-icon>
            {{ saving ? '保存中...' : '保存计费配置' }}
          </button>
        </template>
      </main>
    </div>

    <!-- 编辑规则弹层 -->
    <Teleport to="body">
      <div
        v-if="editingRule"
        class="mas-overlay"
        :class="isDarkTheme ? 'mobile-focus-dark-vars' : 'mobile-focus-light-vars'"
        @click.self="closeRuleEdit"
      >
        <div class="mas-sheet">
          <div class="mas-sheet__head">
            <span class="mas-sheet__title">{{ editingRule.title }}</span>
            <button class="mas-sheet__close" @click="closeRuleEdit">取消</button>
          </div>
          <div class="mas-sheet__body">
            <div :class="fieldClass"><label>规则编码</label><span class="mas-info-text">{{ editingRule.code }}</span></div>
            <div :class="fieldClass"><label>描述</label><span class="mas-info-text">{{ editingRule.description }}</span></div>
            <div :class="fieldClass"><label>计费模式</label><span class="mas-info-text">{{ chargeModeLabel(editingRule.chargeMode) }}</span></div>
            <div :class="fieldClass"><label>单价（分）</label>
              <input v-model.number="editingRule.unitPricePoints" type="number" min="0" max="1000000" :class="inputClass" />
            </div>
            <div :class="fieldClass"><label>最低积分</label>
              <input v-model.number="editingRule.minPoints" type="number" min="0" max="1000000" :class="inputClass" />
            </div>
            <label :class="['mas-check-field', 'mobile-focus-note']">
              <input v-model="editingRule.enabled" type="checkbox" />
              启用此规则
            </label>
            <button :class="saveBtnClass" @click="saveRuleEdit">保存规则</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.mobile-admin-page { --mobile-focus-accent: var(--star-brand-sky, #0ea5e9); --mobile-focus-accent-strong: var(--star-brand-teal, #14b8a6); padding-bottom: 100px; }

.mas-section { margin-bottom: 16px; }
.mas-section__title { font-size: 12px; font-weight: 700; color: var(--mobile-focus-accent, #0ea5e9); margin: 0 0 8px; text-transform: none; letter-spacing: 0.02em; }

/* ── 规则卡片 ── */
.mas-rule-list { display: flex; flex-direction: column; gap: 6px; }
.mas-rule-card {
  width: 100%; text-align: left;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--nw-text-primary) 8%, transparent);
  border-radius: 12px;
  background: var(--mobile-focus-surface);
  backdrop-filter: blur(8px);
  cursor: pointer;
  transition: transform 0.12s ease;
}
.mas-rule-card:active { transform: scale(0.98); }
.mas-rule-card--disabled { opacity: 0.45; }
.mas-rule-card__top { display: flex; align-items: center; gap: 6px; }
.mas-rule-card__code { font-size: 11px; font-family: ui-monospace, monospace; color: var(--nw-text-muted); font-weight: 600; }
.mas-rule-card__cat { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px; }
.mas-rule-cat--generation { background: color-mix(in srgb, var(--mobile-focus-accent) 14%, transparent); color: color-mix(in srgb, var(--mobile-focus-accent) 80%, var(--nw-text-primary)); }
.mas-rule-cat--capability { background: color-mix(in srgb, #f59e0b 14%, transparent); color: color-mix(in srgb, #f59e0b 80%, var(--nw-text-primary)); }
.mas-rule-cat--package { background: color-mix(in srgb, #10b981 14%, transparent); color: color-mix(in srgb, #10b981 80%, var(--nw-text-primary)); }
.mas-rule-card__title { font-size: 14px; font-weight: 700; color: var(--nw-text-primary); margin-top: 4px; }
.mas-rule-card__price { font-size: 13px; color: var(--nw-text-secondary); margin-top: 4px; }
.mas-rule-card__price strong { color: var(--nw-text-primary); font-size: 16px; }
.mas-rule-card__min { font-size: 11px; color: var(--nw-text-muted); margin-left: 4px; }

/* ── 弹层复用 ── */
.mas-overlay {
  position: fixed; inset: 0; z-index: 200;
  --mobile-focus-accent: var(--star-brand-sky, #0ea5e9);
  --mobile-focus-accent-strong: var(--star-brand-teal, #14b8a6);
  display: flex; align-items: flex-end;
  background: color-mix(in srgb, var(--nw-text-primary) 35%, transparent);
  backdrop-filter: blur(4px);
}
.mas-sheet {
  width: 100%; max-height: 78dvh;
  background: var(--mobile-focus-surface-strong);
  color: var(--nw-text-primary);
  border-radius: 22px 22px 0 0;
  display: flex; flex-direction: column;
  overflow: hidden;
  box-shadow: 0 -8px 40px color-mix(in srgb, var(--nw-text-primary) 18%, transparent);
}
.mas-sheet__head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--nw-border);
  flex-shrink: 0;
}
.mas-sheet__title { font-size: 17px; font-weight: 700; color: var(--nw-text-primary); }
.mas-sheet__close {
  border: 1px solid var(--nw-border); border-radius: 10px;
  background: var(--mobile-focus-surface-muted); color: var(--nw-text-secondary);
  font-size: 13px; font-weight: 600; cursor: pointer;
  padding: 6px 14px;
}
.mas-sheet__body {
  flex: 1; overflow-y: auto;
  min-height: 0;
  padding: 16px 20px calc(86px + env(safe-area-inset-bottom, 0px));
  display: flex; flex-direction: column; gap: 10px;
  color: var(--nw-text-primary);
  -webkit-overflow-scrolling: touch;
}
.mas-field { display: grid; gap: 4px; }
.mas-field label { font-size: 12px; font-weight: 600; color: var(--nw-text-secondary); }
.mas-info-text { font-size: 13px; color: var(--nw-text-primary); word-break: break-all; }
.mas-check-field { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--nw-text-secondary); cursor: pointer; }
.mas-check-field input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--mobile-focus-accent); }
.mas-input {
  width: 100%; min-height: 38px; padding: 0 12px;
  border: 1px solid var(--nw-border); border-radius: 10px;
  background: var(--mobile-focus-surface-muted); color: var(--nw-text-primary); font-size: 13px; outline: none;
  -webkit-text-fill-color: var(--nw-text-primary);
}
.mas-input:focus { border-color: var(--mobile-focus-accent); background: var(--mobile-focus-surface-strong); box-shadow: 0 0 0 3px color-mix(in srgb, var(--mobile-focus-accent) 8%, transparent); }
.mas-save {
  position: fixed; left: 20px; right: 20px;
  bottom: calc(14px + env(safe-area-inset-bottom, 0px));
  z-index: 230;
  width: auto; min-height: 44px;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  border: none; border-radius: 12px;
  background: linear-gradient(135deg, var(--mobile-focus-accent, #0ea5e9), var(--mobile-focus-accent-strong, #14b8a6));
  color: var(--mobile-focus-on-accent, #fff); font-size: 14px; font-weight: 700; cursor: pointer;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--nw-text-primary) 20%, transparent);
  margin-top: 12px;
}
.mas-save:disabled { opacity: 0.72; cursor: not-allowed; }
</style>
