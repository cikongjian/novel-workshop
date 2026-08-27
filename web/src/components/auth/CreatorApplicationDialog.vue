<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import { authApi, type UserProfile } from '../../api/auth';
import { extractApiErrorMessage } from '../../utils/api-error';

const props = defineProps<{
  modelValue: boolean;
  profile: UserProfile | null;
  isMobile?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  submitted: [profile: UserProfile];
}>();

const formRef = ref<FormInstance>();
const submitting = ref(false);
const form = reactive({
  penName: '',
  email: '',
  bio: '',
  reason: '',
  sampleWork: '',
});

const rules: FormRules = {
  penName: [
    { required: true, message: '请填写笔名', trigger: 'blur' },
    { min: 2, max: 50, message: '笔名长度需为 2-50 个字符', trigger: 'blur' },
  ],
  email: [
    { required: true, message: '请填写联系邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: ['blur', 'change'] },
  ],
  reason: [
    { required: true, message: '请填写申请说明', trigger: 'blur' },
    { min: 10, max: 1000, message: '申请说明需为 10-1000 个字符', trigger: 'blur' },
  ],
  bio: [
    { max: 300, message: '个人简介不能超过 300 字', trigger: 'blur' },
  ],
  sampleWork: [
    { max: 2000, message: '代表作介绍不能超过 2000 字', trigger: 'blur' },
  ],
};

function syncForm() {
  form.penName = props.profile?.penName || props.profile?.username || '';
  form.email = props.profile?.email || '';
  form.bio = props.profile?.bio || '';
  form.reason = '';
  form.sampleWork = '';
}

watch(
  () => props.modelValue,
  (visible) => {
    if (!visible) return;
    syncForm();
    formRef.value?.clearValidate();
  },
);

watch(
  () => props.profile?.id,
  () => {
    if (props.modelValue) {
      syncForm();
    }
  },
);

function closeDialog() {
  emit('update:modelValue', false);
}

async function handleSubmit() {
  await formRef.value?.validate();
  submitting.value = true;
  try {
    const profile = await authApi.applyCreator({
      penName: form.penName.trim(),
      email: form.email.trim(),
      bio: form.bio.trim(),
      reason: form.reason.trim(),
      sampleWork: form.sampleWork.trim(),
    });
    ElMessage.success('作家申请已提交');
    emit('submitted', profile);
    closeDialog();
  } catch (error) {
    ElMessage.error(extractApiErrorMessage(error, '提交申请失败'));
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="填写作家申请"
    :width="isMobile ? '94vw' : '640px'"
    destroy-on-close
    @close="closeDialog"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="creator-application-form">
      <el-form-item label="笔名" prop="penName">
        <el-input v-model="form.penName" maxlength="50" show-word-limit placeholder="用于前台展示的作家名称" />
      </el-form-item>

      <el-form-item label="联系邮箱" prop="email">
        <el-input v-model="form.email" maxlength="255" placeholder="管理员审核时可联系到你的邮箱" />
      </el-form-item>

      <el-form-item label="个人简介" prop="bio">
        <el-input
          v-model="form.bio"
          type="textarea"
          :rows="3"
          maxlength="300"
          show-word-limit
          placeholder="简单介绍你的创作经历、题材偏好或当前方向"
        />
      </el-form-item>

      <el-form-item label="申请说明" prop="reason">
        <el-input
          v-model="form.reason"
          type="textarea"
          :rows="5"
          maxlength="1000"
          show-word-limit
          placeholder="说明你为什么要申请作家资格，以及准备创作什么内容"
        />
      </el-form-item>

      <el-form-item label="代表作或样章说明" prop="sampleWork">
        <el-input
          v-model="form.sampleWork"
          type="textarea"
          :rows="4"
          maxlength="2000"
          show-word-limit
          placeholder="可填写过往写作经历、代表作品、样章简介或创作计划"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="creator-application-dialog__footer">
        <el-button @click="closeDialog">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">
          提交申请
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.creator-application-form {
  display: grid;
  gap: 4px;
}

.creator-application-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
