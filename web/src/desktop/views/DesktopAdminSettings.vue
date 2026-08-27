<script setup lang="ts">
/**
 * 桌面端·管理设置（数据驱动表单）
 * 复用 fetchSettings / saveSettings。按板块配置字段 → v-for 渲染。
 */
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { fetchSettings, saveSettings, testModel, testEmbedding, testImage, testSmtp, type HomepageFooterContact, type HomepageFooterContactType, type Settings } from '../../api/settings';
import { extractApiErrorMessage } from '../../api/errors';
import Icon from '../../components/shared/Icon.vue';
import StateView from '../../components/shared/StateView.vue';

type FieldType = 'text' | 'password' | 'number' | 'boolean' | 'select' | 'textarea';
interface FieldConfig { key: string; label: string; type: FieldType; options?: { value: string; label: string }[]; }
interface ActionConfig { key: string; label: string; }
interface SectionConfig { key: string; label: string; icon: string; desc: string; fields: FieldConfig[]; actions?: ActionConfig[]; }

const PROVIDERS = [
  { value: 'deepseek', label: 'DeepSeek' }, { value: 'openai', label: 'OpenAI 兼容' },
  { value: 'custom-openai', label: '自定义 OpenAI' },
  { value: 'anthropic', label: 'Anthropic' }, { value: 'qwen', label: '通义千问' },
  { value: 'zhipu', label: '智谱' }, { value: 'moonshot', label: 'Moonshot' },
  { value: 'doubao', label: '豆包' }, { value: 'baichuan', label: '百川' },
  { value: 'stepfun', label: '阶跃' }, { value: 'minimax', label: 'MiniMax' },
  { value: 'siliconflow', label: '硅基流动' }, { value: 'ollama', label: 'Ollama' },
];
const GATE_MODES = [{ value: 'off', label: '关闭' }, { value: 'warn', label: '警告' }, { value: 'strict', label: '严格' }];
const TTS_ENGINES = [{ value: 'edge-tts', label: 'Edge TTS' }, { value: 'qwen3-tts', label: 'Qwen3-TTS' }, { value: 'azure-tts', label: 'Azure TTS' }, { value: 'openai-tts', label: 'OpenAI TTS' }];
const CONTACT_TYPES: { value: HomepageFooterContactType; label: string }[] = [
  { value: 'email', label: '邮箱' },
  { value: 'qq', label: 'QQ' },
  { value: 'wechat', label: '微信' },
  { value: 'wecom', label: '企业微信' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'phone', label: '电话' },
  { value: 'other', label: '其他' },
];

const TRENDS_PROVIDERS = [
  { value: 'none', label: '关闭（不使用搜索）' },
  { value: 'serpapi', label: 'SerpAPI' },
  { value: 'bing', label: 'Bing Search' },
  { value: 'tavily', label: 'Tavily' },
  { value: 'agent-reach', label: 'Agent Reach（Exa + 微博）' },
  { value: 'direct', label: '直接抓取（微博/知乎/百度）' },
];

const SECTIONS: SectionConfig[] = [
  {
    key: 'ai', label: '模型配置', icon: 'layers', desc: 'AI 对话 / 向量 / 图片 / 语音',
    fields: [
      { key: 'modelProvider', label: 'AI 供应商', type: 'select', options: PROVIDERS },
      { key: 'modelApiKey', label: 'API Key', type: 'password' },
      { key: 'modelName', label: '模型名称', type: 'text' },
      { key: 'modelBaseUrl', label: 'Base URL（留空用默认）', type: 'text' },
      { key: 'modelStreamingEnabled', label: '流式输出（SSE）', type: 'boolean' },
      { key: 'embeddingProvider', label: '向量供应商', type: 'select', options: PROVIDERS },
      { key: 'embeddingApiKey', label: '向量 API Key', type: 'password' },
      { key: 'embeddingModel', label: '向量模型', type: 'text' },
      { key: 'embeddingBaseUrl', label: '向量 Base URL', type: 'text' },
      { key: 'imageApiKey', label: '图片 API Key', type: 'password' },
      { key: 'imageModel', label: '图片模型', type: 'text' },
      { key: 'imageBaseUrl', label: '图片 Base URL', type: 'text' },
      { key: 'ttsEngine', label: 'TTS 引擎', type: 'select', options: TTS_ENGINES },
      { key: 'qwen3TtsUrl', label: 'Qwen3-TTS 地址', type: 'text' },
      { key: 'ttsNarrationEngine', label: '旁白引擎', type: 'select', options: [{ value: 'edge-tts', label: 'Edge' }, { value: 'kokoro', label: 'Kokoro' }] },
      { key: 'kokoroUrl', label: 'Kokoro 地址', type: 'text' },
    ],
    actions: [
      { key: 'testModel', label: '测试模型' },
      { key: 'testEmbedding', label: '测试向量' },
      { key: 'testImage', label: '测试图片' },
    ],
  },
  {
    key: 'gates', label: '创作门禁', icon: 'checkCircle', desc: '世界/大纲/质量/连贯/AI痕迹 门禁',
    fields: [
      { key: 'worldGateMode', label: '世界观门禁', type: 'select', options: GATE_MODES },
      { key: 'worldContractEnabled', label: '世界契约', type: 'boolean' },
      { key: 'worldRetrievalTopK', label: '世界检索 TopK', type: 'number' },
      { key: 'outlineGateMode', label: '大纲门禁', type: 'select', options: GATE_MODES },
      { key: 'qualityGateMode', label: '质量门禁', type: 'select', options: GATE_MODES },
      { key: 'qualityGatePassScore', label: '质量通过分', type: 'number' },
      { key: 'continuityGateMode', label: '连贯性门禁', type: 'select', options: GATE_MODES },
      { key: 'powerRuleGateMode', label: '力量规则门禁', type: 'select', options: GATE_MODES },
      { key: 'aiTraceGateMode', label: 'AI 痕迹门禁', type: 'select', options: GATE_MODES },
      { key: 'chapterLengthGuardEnabled', label: '字数纠偏', type: 'boolean' },
      { key: 'autoRevisionEnabled', label: '自动修订', type: 'boolean' },
      { key: 'qualityFloorRevisionEnabled', label: '强制质量地板修订', type: 'boolean' },
      { key: 'autoFinalizeEnabled', label: '生成后自动定稿', type: 'boolean' },
    ],
  },
  {
    key: 'publish', label: '发布权限', icon: 'book', desc: '书城发布限制与解锁条件',
    fields: [
      { key: 'publishMaxPerMonth', label: '每月发布上限', type: 'number' },
      { key: 'publishUnlockReads', label: '解锁所需阅读', type: 'number' },
      { key: 'publishUnlockLikes', label: '解锁所需点赞', type: 'number' },
      { key: 'publishUnlockChapters', label: '解锁所需章节', type: 'number' },
      { key: 'disableCoverUpload', label: '禁止封面上传', type: 'boolean' },
      { key: 'commentEnabled', label: '启用评论', type: 'boolean' },
      { key: 'comicChapterEnabled', label: '章节漫画', type: 'boolean' },
    ],
  },
  {
    key: 'trends', label: '热点趋势', icon: 'trendingUp', desc: '热点报告搜索源与定时刷新',
    fields: [
      { key: 'trendsEnabled', label: '启用热点趋势', type: 'boolean' },
      { key: 'trendsSearchProvider', label: '搜索引擎', type: 'select', options: TRENDS_PROVIDERS },
      { key: 'trendsSearchApiKey', label: '搜索 API Key', type: 'password' },
      { key: 'trendsSearchApiBaseUrl', label: '自定义 Base URL', type: 'text' },
      { key: 'trendsScheduleHour', label: '每日刷新小时（0-23）', type: 'number' },
      { key: 'trendsScheduleMinute', label: '每日刷新分钟（0-59）', type: 'number' },
    ],
  },
  {
    key: 'security', label: '安全认证', icon: 'settings', desc: '密码策略 / 注册保护 / 实名',
    fields: [
      { key: 'authPasswordMinLength', label: '密码最小长度', type: 'number' },
      { key: 'authPasswordRequireUppercase', label: '需大写字母', type: 'boolean' },
      { key: 'authPasswordRequireNumbers', label: '需数字', type: 'boolean' },
      { key: 'registrationProtectionEnabled', label: '注册保护', type: 'boolean' },
      { key: 'registrationProtectionRegPerHour', label: '每小时注册上限', type: 'number' },
      { key: 'userApiFeatureEnabled', label: '用户自填 API', type: 'boolean' },
      { key: 'realNameVerificationEnabled', label: '实名认证', type: 'boolean' },
    ],
  },
  {
    key: 'ops', label: '运营配置', icon: 'store', desc: '平台 URL / 邮件 / 推送',
    fields: [
      { key: 'platformUrl', label: '平台 URL', type: 'text' },
      { key: 'smtpHost', label: 'SMTP 主机', type: 'text' },
      { key: 'smtpPort', label: 'SMTP 端口', type: 'number' },
      { key: 'smtpUser', label: 'SMTP 用户', type: 'text' },
      { key: 'smtpPass', label: 'SMTP 密码', type: 'password' },
      { key: 'smtpFrom', label: '发件人', type: 'text' },
      { key: 'baiduPushToken', label: '百度推送 Token', type: 'password' },
    ],
    actions: [{ key: 'testSmtp', label: '测试 SMTP' }],
  },
  {
    key: 'site', label: '站点信息', icon: 'globe', desc: '联系方式 / 备案 / 网站地图',
    fields: [],
  }, 
];

const activeSection = ref(0);
const form = ref<Record<string, unknown>>({});
const loading = ref(true);
const saving = ref<number | null>(null);
const loadError = ref('');

function ensureHomepageConfig(settings: Record<string, unknown>): void {
  const homepageConfig = (settings.homepageConfig ?? {}) as Record<string, unknown>;
  const footer = (homepageConfig.footer ?? {}) as Record<string, unknown>;
  homepageConfig.footer = {
    companyName: '',
    copyrightText: '',
    icpNumber: '',
    icpLink: '',
    policeNumber: '',
    policeLink: '',
    supportEmail: '',
    address: '',
    privacyLabel: '隐私政策',
    privacyLink: '/privacy',
    termsLabel: '用户协议',
    termsLink: '/terms',
    contactLabel: '联系我们',
    contactLink: '',
    contacts: [],
    navGroups: [],
    ...footer,
  };
  settings.homepageConfig = homepageConfig;
}

const siteFooter = computed(() => ((form.value.homepageConfig as Settings['homepageConfig'] | undefined)?.footer));
const siteContacts = computed(() => siteFooter.value?.contacts ?? []);
const sitemapBaseUrl = computed(() => String(form.value.platformUrl ?? '').replace(/\/$/, ''));
const sitemapLinks = computed(() => {
  const base = sitemapBaseUrl.value;
  if (!base) return [];
  return [
    { label: '网站地图', href: `${base}/sitemap.xml` },
    { label: 'Robots', href: `${base}/robots.txt` },
    { label: '订阅 Feed', href: `${base}/feed.xml` },
  ];
});

function addContact(): void {
  const footer = siteFooter.value;
  if (!footer) return;
  footer.contacts.push({ type: 'email', label: '', value: '', href: '' });
}

function removeContact(index: number): void {
  const footer = siteFooter.value;
  if (!footer) return;
  footer.contacts.splice(index, 1);
}

async function saveSiteSettings(): Promise<void> {
  saving.value = activeSection.value;
  try {
    await saveSettings({
      platformUrl: form.value.platformUrl,
      homepageConfig: form.value.homepageConfig,
    } as Omit<Settings, 'configured' | 'providers'>);
    ElMessage.success('站点信息已保存');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '保存失败'));
  } finally {
    saving.value = null;
  }
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const settings = { ...(await fetchSettings()) } as Record<string, unknown>;
    ensureHomepageConfig(settings);
    form.value = settings;
  } catch (err) {
    loadError.value = extractApiErrorMessage(err, '加载设置失败');
  } finally {
    loading.value = false;
  }
}
load();

const currentSection = computed(() => SECTIONS[activeSection.value]);

async function saveSection(): Promise<void> {
  saving.value = activeSection.value;
  try {
    const server = await fetchSettings();
    const payload: Record<string, unknown> = { ...server };
    for (const field of currentSection.value.fields) {
      payload[field.key] = form.value[field.key];
    }
    const { configured, providers, realNameVerificationProviders, ...rest } = payload as any;
    await saveSettings(rest as Omit<Settings, 'configured' | 'providers'>);
    ElMessage.success(`${currentSection.value.label} 已保存`);
    form.value = await fetchSettings();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '保存失败'));
  } finally {
    saving.value = null;
  }
}

/** 连通性测试 */
const testingKey = ref<string | null>(null);
async function runAction(key: string): Promise<void> {
  testingKey.value = key;
  try {
    const f = form.value;
    let success = false;
    let detail = '';
    if (key === 'testModel') {
      const res = await testModel({ provider: String(f.modelProvider ?? ''), apiKey: String(f.modelApiKey ?? ''), model: String(f.modelName ?? ''), baseUrl: String(f.modelBaseUrl ?? '') });
      success = res.success;
      detail = res.reply ?? '';
    } else if (key === 'testEmbedding') {
      const res = await testEmbedding({ provider: String(f.embeddingProvider ?? ''), apiKey: String(f.embeddingApiKey ?? ''), model: String(f.embeddingModel ?? ''), baseUrl: String(f.embeddingBaseUrl ?? '') });
      success = res.success;
    } else if (key === 'testImage') {
      const res = await testImage({ apiKey: String(f.imageApiKey ?? ''), model: String(f.imageModel ?? ''), baseUrl: String(f.imageBaseUrl ?? '') });
      success = res.success;
    } else if (key === 'testSmtp') {
      const res = await testSmtp({ host: String(f.smtpHost ?? ''), port: Number(f.smtpPort ?? 587), secure: Boolean(f.smtpSecure), user: String(f.smtpUser ?? ''), pass: String(f.smtpPass ?? ''), from: String(f.smtpFrom ?? '') });
      success = res.success;
      detail = res.error ?? '';
    }
    if (success) ElMessage.success(detail || '连接成功');
    else ElMessage.error(detail || '连接失败');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '测试失败'));
  } finally {
    testingKey.value = null;
  }
}
</script>

<template>
  <div class="desktop-admin">
    <div class="desktop-greeting">
      <h1>管理设置</h1>
    </div>

    <StateView :loading="loading" :error="loadError ? new Error(loadError) : null" :error-message="loadError" @retry="load">
      <div class="admin-layout">
        <!-- 板块导航 -->
        <nav class="admin-nav">
          <button
            v-for="(section, i) in SECTIONS"
            :key="section.key"
            class="admin-nav-item"
            :class="{ 'is-active': activeSection === i }"
            @click="activeSection = i"
          >
            <Icon :name="section.icon" :size="16" />
            <span class="admin-nav-text">
              <strong>{{ section.label }}</strong>
              <small>{{ section.desc }}</small>
            </span>
          </button>
        </nav>

        <!-- 表单区 -->
        <div class="admin-form nw-panel">
          <div class="nw-panel__head">
            <h2 class="nw-panel__title">{{ currentSection.label }}</h2>
            <button
              class="desktop-btn desktop-btn--primary"
              :disabled="saving !== null"
              @click="currentSection.key === 'site' ? saveSiteSettings() : saveSection()"
            >
              {{ saving === activeSection ? '保存中…' : '保存' }}
            </button>
          </div>
          <div v-if="currentSection.key === 'site' && siteFooter" class="admin-fields admin-site-fields">
            <div class="admin-field admin-field--wide">
              <label class="admin-field-label">平台 URL</label>
              <input v-model="form.platformUrl" class="nw-input" placeholder="https://example.com" />
            </div>
            <div class="admin-field"><label class="admin-field-label">平台/公司名称</label><input v-model="siteFooter.companyName" class="nw-input" /></div>
            <div class="admin-field"><label class="admin-field-label">版权文案</label><input v-model="siteFooter.copyrightText" class="nw-input" /></div>
            <div class="admin-field"><label class="admin-field-label">ICP备案号</label><input v-model="siteFooter.icpNumber" class="nw-input" placeholder="如：京ICP备XXXXXXXX号" /></div>
            <div class="admin-field"><label class="admin-field-label">ICP备案链接</label><input v-model="siteFooter.icpLink" class="nw-input" placeholder="https://beian.miit.gov.cn/" /></div>
            <div class="admin-field"><label class="admin-field-label">公安备案号</label><input v-model="siteFooter.policeNumber" class="nw-input" placeholder="如：京公网安备 XXXXXXXXXXXX号" /></div>
            <div class="admin-field"><label class="admin-field-label">公安备案链接</label><input v-model="siteFooter.policeLink" class="nw-input" placeholder="https://beian.mps.gov.cn/" /></div>
            <div class="admin-field"><label class="admin-field-label">客服邮箱</label><input v-model="siteFooter.supportEmail" class="nw-input" placeholder="support@example.com" /></div>
            <div class="admin-field"><label class="admin-field-label">联系地址</label><input v-model="siteFooter.address" class="nw-input" /></div>
            <div class="admin-field"><label class="admin-field-label">隐私政策文案</label><input v-model="siteFooter.privacyLabel" class="nw-input" /></div>
            <div class="admin-field"><label class="admin-field-label">隐私政策链接</label><input v-model="siteFooter.privacyLink" class="nw-input" /></div>
            <div class="admin-field"><label class="admin-field-label">用户协议文案</label><input v-model="siteFooter.termsLabel" class="nw-input" /></div>
            <div class="admin-field"><label class="admin-field-label">用户协议链接</label><input v-model="siteFooter.termsLink" class="nw-input" /></div>
            <div class="admin-field"><label class="admin-field-label">联系入口文案</label><input v-model="siteFooter.contactLabel" class="nw-input" /></div>
            <div class="admin-field"><label class="admin-field-label">联系入口链接</label><input v-model="siteFooter.contactLink" class="nw-input" /></div>

            <section class="admin-field admin-field--wide admin-site-box">
              <div class="admin-site-box-head">
                <div><strong>联系方式</strong><small>展示在官网页脚，建议至少配置一个可公开联系的邮箱或客服入口</small></div>
                <button class="desktop-btn" type="button" @click="addContact">新增联系渠道</button>
              </div>
              <div v-if="!siteContacts.length" class="admin-site-empty">还没有配置联系渠道。点击“新增联系渠道”，填写展示名称、联系方式和跳转链接后保存。</div>
              <div v-for="(contact, index) in siteContacts" :key="index" class="admin-contact-row">
                <select v-model="contact.type" class="nw-input">
                  <option v-for="type in CONTACT_TYPES" :key="type.value" :value="type.value">{{ type.label }}</option>
                </select>
                <input v-model="contact.label" class="nw-input" placeholder="页面显示名称，如 商务合作" />
                <input v-model="contact.value" class="nw-input" placeholder="邮箱、电话、QQ 或微信号" />
                <input v-model="contact.href" class="nw-input" placeholder="可选跳转，如 mailto:hi@example.com" />
                <button class="desktop-btn" type="button" @click="removeContact(index)">删除</button>
              </div>
            </section>

            <section class="admin-field admin-field--wide admin-site-box">
              <div class="admin-site-box-head">
                <div><strong>搜索引擎收录文件</strong><small>保存平台 URL 后，系统会自动生成站点地图、爬虫规则和订阅源</small></div>
              </div>
              <div v-if="sitemapLinks.length" class="admin-sitemap-links">
                <a v-for="link in sitemapLinks" :key="link.href" :href="link.href" target="_blank" rel="noreferrer">{{ link.label }}：{{ link.href }}</a>
              </div>
              <div v-else class="admin-site-empty">请先在上方填写完整的平台 URL，例如 https://example.com。保存后这里会生成 sitemap.xml、robots.txt 和 feed.xml 的访问地址。</div>
            </section>
          </div>
          <div v-else class="admin-fields">
            <div v-for="field in currentSection.fields" :key="field.key" class="admin-field">
              <label class="admin-field-label">{{ field.label }}</label>
              <input v-if="field.type === 'text'" v-model="form[field.key]" class="nw-input" />
              <input v-else-if="field.type === 'password'" v-model="form[field.key]" type="password" class="nw-input" />
              <input v-else-if="field.type === 'number'" v-model.number="form[field.key]" type="number" class="nw-input" />
              <select v-else-if="field.type === 'select'" v-model="form[field.key]" class="nw-input">
                <option v-for="opt in field.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
              <label v-else-if="field.type === 'boolean'" class="admin-toggle">
                <input type="checkbox" v-model="form[field.key]" />
                <span class="admin-toggle-track" :class="{ on: form[field.key] }"><span class="admin-toggle-thumb" /></span>
              </label>
            </div>

            <div v-if="currentSection.actions?.length" class="admin-actions">
              <button
                v-for="action in currentSection.actions"
                :key="action.key"
                class="desktop-btn"
                :disabled="testingKey !== null"
                @click="runAction(action.key)"
              >
                {{ testingKey === action.key ? '测试中…' : action.label }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </StateView>
  </div>
</template>
