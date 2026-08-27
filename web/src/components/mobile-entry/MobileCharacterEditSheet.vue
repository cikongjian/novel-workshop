<script setup lang="ts">
/**
 * 角色档案编辑弹层 —— 作者/管理员手动编辑角色名称、介绍及相关设定字段。
 * 复用 PUT /api/novels/:novelId/characters/:characterId（Partial<CharacterProfile>）。
 * 采用 el-dialog + mobile-focus 主题类，与移动端其它弹层风格一致。
 */
import { reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { CHARACTER_ROLE_LABELS, type CharacterProfile } from '../../types';
import { updateCharacter } from '../../api/characters';

const ROLE_OPTIONS: Array<{ value: CharacterProfile['role']; label: string }> = [
  { value: 'protagonist', label: CHARACTER_ROLE_LABELS.protagonist },
  { value: 'deuteragonist', label: CHARACTER_ROLE_LABELS.deuteragonist },
  { value: 'antagonist', label: CHARACTER_ROLE_LABELS.antagonist },
  { value: 'rival', label: CHARACTER_ROLE_LABELS.rival },
  { value: 'love_interest', label: CHARACTER_ROLE_LABELS.love_interest },
  { value: 'mentor', label: CHARACTER_ROLE_LABELS.mentor },
  { value: 'ally', label: CHARACTER_ROLE_LABELS.ally },
  { value: 'faction_leader', label: CHARACTER_ROLE_LABELS.faction_leader },
  { value: 'supporting', label: CHARACTER_ROLE_LABELS.supporting },
  { value: 'family', label: CHARACTER_ROLE_LABELS.family },
  { value: 'comic_relief', label: CHARACTER_ROLE_LABELS.comic_relief },
  { value: 'minor', label: CHARACTER_ROLE_LABELS.minor },
];

const props = defineProps<{
  visible: boolean;
  novelId: string;
  character: CharacterProfile | null;
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const saving = ref(false);

const form = reactive({
  name: '',
  role: 'supporting' as CharacterProfile['role'],
  aliases: '',
  gender: '',
  age: '',
  position: '',
  personality: '',
  personalityTraits: '',
  appearance: '',
  speechStyle: '',
  speechExamples: '',
  backstory: '',
  motivation: '',
  abilities: '',
  arc: '',
});

watch(
  () => props.visible,
  (open) => {
    if (!open || !props.character) return;
    form.name = props.character.name ?? '';
    form.role = props.character.role;
    form.aliases = (props.character.aliases ?? []).join('、');
    form.gender = props.character.gender ?? '';
    form.age = props.character.age ?? '';
    form.position = props.character.position ?? '';
    form.personality = props.character.personality ?? '';
    form.personalityTraits = (props.character.personalityTraits ?? []).join('、');
    form.appearance = props.character.appearance ?? '';
    form.speechStyle = props.character.speechStyle ?? '';
    form.speechExamples = (props.character.speechExamples ?? []).join('\n');
    form.backstory = props.character.backstory ?? '';
    form.motivation = props.character.motivation ?? '';
    form.abilities = (props.character.abilities ?? []).join('、');
    form.arc = props.character.arc ?? '';
    saving.value = false;
  },
  { immediate: true },
);

/** 逗号/顿号分隔 → 数组 */
function splitList(input: string): string[] {
  return input.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
}

/** 换行分隔 → 数组 */
function splitLines(input: string): string[] {
  return input.split(/\n/).map((s) => s.trim()).filter(Boolean);
}

async function handleSave() {
  if (!props.character) return;
  const name = form.name.trim();
  if (!name) {
    ElMessage.warning('角色名不能为空');
    return;
  }
  saving.value = true;
  try {
    await updateCharacter(props.novelId, props.character.id, {
      name,
      role: form.role,
      aliases: splitList(form.aliases),
      gender: form.gender.trim(),
      age: form.age.trim(),
      position: form.position.trim(),
      personality: form.personality.trim(),
      personalityTraits: splitList(form.personalityTraits),
      appearance: form.appearance.trim(),
      speechStyle: form.speechStyle.trim(),
      speechExamples: splitLines(form.speechExamples),
      backstory: form.backstory.trim(),
      motivation: form.motivation.trim(),
      abilities: splitList(form.abilities),
      arc: form.arc.trim(),
    });
    ElMessage.success('角色档案已保存');
    emit('saved');
    emit('close');
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || '保存失败');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="编辑角色档案"
    width="92%"
    class="mobile-character-edit-dialog"
    @update:model-value="(val: boolean) => { if (!val) emit('close'); }"
  >
    <div class="char-edit-form">
      <div class="char-edit-field">
        <label class="char-edit-field__label">角色名</label>
        <el-input v-model="form.name" placeholder="角色名（必填）" maxlength="40" />
      </div>

      <div class="char-edit-field">
        <label class="char-edit-field__label">角色身份</label>
        <div class="char-edit-role-group">
          <button
            v-for="opt in ROLE_OPTIONS"
            :key="opt.value"
            type="button"
            class="char-edit-role-chip"
            :class="{ active: form.role === opt.value }"
            @click="form.role = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <div class="char-edit-field">
        <label class="char-edit-field__label">别名</label>
        <el-input v-model="form.aliases" placeholder="多个别名用顿号或逗号分隔" />
      </div>

      <div class="char-edit-row3">
        <div class="char-edit-field">
          <label class="char-edit-field__label">性别</label>
          <el-input v-model="form.gender" placeholder="如：男" />
        </div>
        <div class="char-edit-field">
          <label class="char-edit-field__label">年龄</label>
          <el-input v-model="form.age" placeholder="如：28" />
        </div>
        <div class="char-edit-field">
          <label class="char-edit-field__label">职位/头衔</label>
          <el-input v-model="form.position" placeholder="如：宗主" />
        </div>
      </div>

      <div class="char-edit-field">
        <label class="char-edit-field__label">性格</label>
        <el-input v-model="form.personality" type="textarea" :rows="3" placeholder="角色的性格描述" />
      </div>

      <div class="char-edit-field">
        <label class="char-edit-field__label">性格标签</label>
        <el-input v-model="form.personalityTraits" placeholder="多个标签用顿号或逗号分隔" />
      </div>

      <div class="char-edit-field">
        <label class="char-edit-field__label">外貌</label>
        <el-input v-model="form.appearance" type="textarea" :rows="3" placeholder="外貌特征描述" />
      </div>

      <div class="char-edit-field">
        <label class="char-edit-field__label">说话风格</label>
        <el-input v-model="form.speechStyle" type="textarea" :rows="2" placeholder="语言风格、口头禅等" />
      </div>

      <div class="char-edit-field">
        <label class="char-edit-field__label">代表台词</label>
        <el-input v-model="form.speechExamples" type="textarea" :rows="3" placeholder="每行一句代表台词" />
      </div>

      <div class="char-edit-field">
        <label class="char-edit-field__label">背景故事</label>
        <el-input v-model="form.backstory" type="textarea" :rows="4" placeholder="角色的出身与过往" />
      </div>

      <div class="char-edit-field">
        <label class="char-edit-field__label">核心动机</label>
        <el-input v-model="form.motivation" type="textarea" :rows="3" placeholder="角色最想达成什么" />
      </div>

      <div class="char-edit-field">
        <label class="char-edit-field__label">能力</label>
        <el-input v-model="form.abilities" placeholder="多个能力用顿号或逗号分隔" />
      </div>

      <div class="char-edit-field">
        <label class="char-edit-field__label">成长轨迹</label>
        <el-input v-model="form.arc" type="textarea" :rows="3" placeholder="角色的成长弧线" />
      </div>
    </div>

    <template #footer>
      <button class="mobile-focus-button--ghost" type="button" :disabled="saving" @click="emit('close')">取消</button>
      <button class="mobile-focus-button--primary" type="button" :disabled="saving" @click="handleSave">
        {{ saving ? '保存中...' : '保存' }}
      </button>
    </template>
  </el-dialog>
</template>

<style scoped>
.char-edit-form {
  display: grid;
  gap: 12px;
  padding-top: 4px;
}

.char-edit-field {
  display: grid;
  gap: 4px;
}

.char-edit-field__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--nw-text-muted);
}

.char-edit-row3 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.char-edit-role-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.char-edit-role-chip {
  padding: 7px 14px;
  border: 1px solid var(--nw-border);
  border-radius: 999px;
  background: var(--nw-bg-secondary);
  color: var(--nw-text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}

.char-edit-role-chip.active {
  border-color: color-mix(in srgb, var(--mobile-focus-accent) 55%, var(--nw-border));
  background: color-mix(in srgb, var(--mobile-focus-accent) 10%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-focus-accent) 88%, var(--nw-text-primary));
}
</style>
