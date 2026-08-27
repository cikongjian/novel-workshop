<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import MobileSectionCard from '../components/mobile-focus/MobileSectionCard.vue';
import MobileTopbar from '../components/mobile-focus/MobileTopbar.vue';
import SliderCaptcha from '../components/auth/SliderCaptcha.vue';
import UserAgreementDialog from '../components/legal/UserAgreementDialog.vue';
import { useAuthForms } from '../composables/useAuthForms';
import { authApi } from '../api/auth';
import { extractApiErrorMessage } from '../utils/api-error';
import { useThemeMode } from '../composables/useThemeMode';
import '../styles/mobile-login.css';
import { brand } from '../config/brand';

const router = useRouter();
const { isDark: isDarkTheme, isWarmNight } = useThemeMode();

const {
  activeTab,
  loading,
  agreeTerms,
  showTermsDialog,
  passwordPolicyHint,
  loginForm,
  registerForm,
  rememberMe,
  onLoginSliderVerified,
  onRegisterSliderVerified,
  onLoginSliderReset,
  onRegisterSliderReset,
  handleLogin,
  handleRegister,
} = useAuthForms('/m/app');

const formHint = '一个账号，畅读全站，随心创作。';

// ── 忘记密码 ──
const forgotMode = ref(false);
const forgotLoading = ref(false);
const forgotForm = ref({ username: '', phone: '', newPassword: '' });
const forgotSliderVerified = ref(false);

function openForgotPassword() {
  forgotForm.value = { username: '', phone: '', newPassword: '' };
  forgotSliderVerified.value = false;
  forgotMode.value = true;
}

function closeForgotPassword() {
  forgotMode.value = false;
}

function resetForgotSlider() {
  forgotSliderVerified.value = false;
  (window as any).__mobileLoginForgotSlider = null;
}

async function handleForgotPassword() {
  if (!forgotForm.value.username.trim()) {
    ElMessage.warning('请输入用户名');
    return;
  }
  if (!forgotForm.value.phone.trim()) {
    ElMessage.warning('请输入注册时使用的手机号');
    return;
  }
  if (!forgotForm.value.newPassword.trim()) {
    ElMessage.warning('请输入新密码');
    return;
  }
  if (!forgotSliderVerified.value) {
    ElMessage.warning('请先完成滑块验证');
    return;
  }

  forgotLoading.value = true;
  try {
    const slider = (window as any).__mobileLoginForgotSlider;
    await authApi.forgotPassword({
      username: forgotForm.value.username.trim(),
      phone: forgotForm.value.phone.trim(),
      newPassword: forgotForm.value.newPassword,
      sliderChallengeId: slider?.challengeId ?? '',
      sliderPosition: slider?.position ?? 0,
      sliderDuration: slider?.duration ?? 0,
    });
    ElMessage.success('密码重置成功，请登录');
    closeForgotPassword();
    activeTab.value = 'login';
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '重置失败'));
  } finally {
    forgotLoading.value = false;
  }
}

function onForgotSliderVerified(data: { challengeId: string; position: number; duration: number }) {
  forgotSliderVerified.value = true;
  (window as any).__mobileLoginForgotSlider = data;
}
</script>

<template>
  <div class="mobile-login-page mobile-focus-page" :class="{ 'mobile-focus-page--dark': isDarkTheme, 'mobile-focus-page--warm-night': isWarmNight }">
    <div class="mobile-focus-shell">
      <MobileTopbar :title="forgotMode ? '找回密码' : brand.displayName" :subtitle="forgotMode ? '验证身份后重置' : '账号入口'" :brand-size="32">
        <template #leading>
          <button class="mobile-focus-button--ghost" type="button" @click="forgotMode ? closeForgotPassword() : router.push('/m')">
            {{ forgotMode ? '返回登录' : '返回' }}
          </button>
        </template>
      </MobileTopbar>

      <main class="mobile-focus-main">
        <!-- 忘记密码 -->
        <MobileSectionCard
          v-if="forgotMode"
          kicker="Account"
          title="找回密码"
          hint="验证账号资料后更新密码"
          class="mobile-login-card"
        >
          <div class="mobile-login-panel-note">
            <strong>账号安全验证</strong>
            <span>使用注册手机号确认身份。</span>
          </div>

          <div class="mobile-focus-input-stack">
            <input
              v-model="forgotForm.username"
              type="text"
              class="mobile-focus-input"
              placeholder="用户名"
            />
            <input
              v-model="forgotForm.phone"
              type="tel"
              class="mobile-focus-input"
              placeholder="注册手机号（11位）"
              maxlength="11"
            />
            <input
              v-model="forgotForm.newPassword"
              type="password"
              class="mobile-focus-input"
              :placeholder="passwordPolicyHint"
            />

            <div class="mobile-login-slider">
              <SliderCaptcha
                @verified="onForgotSliderVerified"
                @challenge-reset="resetForgotSlider"
              />
            </div>

            <button
              class="mobile-focus-button--primary mobile-login-submit"
              type="button"
              :disabled="forgotLoading"
              @click="handleForgotPassword"
            >
              {{ forgotLoading ? '重置中...' : '重置密码' }}
            </button>
          </div>
        </MobileSectionCard>

        <!-- 登录/注册 -->
        <MobileSectionCard
          v-else
          kicker="Account"
          title="登录或注册"
          :hint="formHint"
          class="mobile-login-card"
        >
          <div class="mobile-focus-tabs">
            <button
              :class="['mobile-focus-tab', { active: activeTab === 'login' }]"
              type="button"
              @click="activeTab = 'login'"
            >
              登录
            </button>
            <button
              :class="['mobile-focus-tab', { active: activeTab === 'register' }]"
              type="button"
              @click="activeTab = 'register'"
            >
              注册
            </button>
          </div>

          <div v-if="activeTab === 'login'" class="mobile-focus-input-stack">
            <input
              v-model="loginForm.username"
              type="text"
              class="mobile-focus-input"
              placeholder="用户名"
              @keyup.enter="handleLogin"
            />
            <input
              v-model="loginForm.password"
              type="password"
              class="mobile-focus-input"
              placeholder="密码"
              @keyup.enter="handleLogin"
            />

            <div class="mobile-login-slider">
              <SliderCaptcha
                @verified="onLoginSliderVerified"
                @challenge-reset="onLoginSliderReset"
              />
            </div>

            <label class="mobile-login-remember">
              <input v-model="rememberMe" type="checkbox" />
              <span>记住用户名</span>
            </label>

            <button class="mobile-focus-button--primary mobile-login-submit" type="button" :disabled="loading" @click="handleLogin">
              {{ loading ? '登录中...' : '登录' }}
            </button>

            <button class="mobile-login-forgot" type="button" @click="openForgotPassword">
              忘记密码？
            </button>
          </div>

          <div v-else class="mobile-focus-input-stack">
            <div class="mobile-register-hint">
              <strong>注册即加入{{ brand.displayName }}</strong>
              <span>畅读书城、发布作品、参与互动，一站完成。</span>
            </div>

            <input
              v-model="registerForm.username"
              type="text"
              class="mobile-focus-input"
              placeholder="用户名"
            />
            <input
              v-model="registerForm.phone"
              type="tel"
              class="mobile-focus-input"
              placeholder="手机号（11位）"
              maxlength="11"
            />
            <input
              v-model="registerForm.password"
              type="password"
              class="mobile-focus-input"
              :placeholder="passwordPolicyHint"
            />
            <input
              v-model="registerForm.confirmPassword"
              type="password"
              class="mobile-focus-input"
              placeholder="确认密码"
            />

            <div class="mobile-login-slider">
              <SliderCaptcha
                @verified="onRegisterSliderVerified"
                @challenge-reset="onRegisterSliderReset"
              />
            </div>

            <label class="mobile-login-agreement">
              <input v-model="agreeTerms" type="checkbox" />
              <span>已阅读并同意</span>
              <button class="mobile-login-inline-link" type="button" @click.prevent.stop="showTermsDialog = true">
                用户协议
              </button>
            </label>

            <button
              class="mobile-focus-button--primary mobile-login-submit"
              type="button"
              :disabled="loading || !agreeTerms"
              @click="handleRegister"
            >
              {{ loading ? '注册中...' : '注册并进入' }}
            </button>
          </div>
        </MobileSectionCard>
      </main>
    </div>

    <UserAgreementDialog v-model="showTermsDialog" />
  </div>
</template>
