import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../stores/auth';
import { brand } from '../config/brand';
import { usePasswordPolicy } from './usePasswordPolicy';
import { validatePasswordAgainstPolicy } from '../utils/password-policy';
import {
  clearRememberedLogin,
  loadRememberedLogin,
  saveRememberedLogin,
} from '../utils/remembered-login';

interface SliderState {
  challengeId: string;
  position: number;
  duration: number;
  verified: boolean;
}

function createSliderState(): SliderState {
  return reactive({
    challengeId: '',
    position: 0,
    duration: 0,
    verified: false,
  });
}

function applySliderPayload(
  state: SliderState,
  payload: { challengeId: string; position: number; duration: number },
) {
  state.challengeId = payload.challengeId;
  state.position = payload.position;
  state.duration = payload.duration;
  state.verified = true;
}

function resetSliderState(state: SliderState) {
  state.challengeId = '';
  state.position = 0;
  state.duration = 0;
  state.verified = false;
}

const REMEMBER_ME_KEY = `${brand.slug}.rememberMe`;

export function useAuthForms(defaultRedirect = '/m/app') {
  const router = useRouter();
  const route = useRoute();
  const authStore = useAuthStore();
  const { passwordPolicy, passwordPolicyHint, loadPasswordPolicy } = usePasswordPolicy();
  void loadPasswordPolicy();

  const activeTab = ref<'login' | 'register'>('login');
  const loading = ref(false);
  const agreeTerms = ref(false);
  const showTermsDialog = ref(false);

  const remembered = loadRememberedLogin(localStorage, REMEMBER_ME_KEY);
  const rememberMe = ref(remembered.remember);

  const loginSlider = createSliderState();
  const registerSlider = createSliderState();

  const loginForm = reactive({
    username: remembered.username,
    password: '',
  });

  const registerForm = reactive({
    username: '',
    password: '',
    phone: '',
    confirmPassword: '',
    inviteCode: '',
  });

  function resolveDefaultRedirect(): string {
    if (authStore.isCreator) {
      return defaultRedirect;
    }
    return defaultRedirect.startsWith('/m') ? '/m' : '/';
  }

  function resolveRedirect(): string {
    const redirect = route.query.redirect;
    return typeof redirect === 'string' && redirect.length > 0 ? redirect : resolveDefaultRedirect();
  }

  function onLoginSliderVerified(payload: { challengeId: string; position: number; duration: number }) {
    applySliderPayload(loginSlider, payload);
  }

  function onRegisterSliderVerified(payload: { challengeId: string; position: number; duration: number }) {
    applySliderPayload(registerSlider, payload);
  }

  function onLoginSliderReset() {
    resetSliderState(loginSlider);
  }

  function onRegisterSliderReset() {
    resetSliderState(registerSlider);
  }

  async function handleLogin() {
    if (!loginForm.username || !loginForm.password) {
      ElMessage.warning('请填写用户名和密码');
      return;
    }
    if (!loginSlider.verified) {
      ElMessage.warning('请完成滑块验证');
      return;
    }

    loading.value = true;
    try {
      await authStore.login(
        loginForm.username, loginForm.password,
        loginSlider.challengeId, loginSlider.position, loginSlider.duration,
      );
      if (rememberMe.value) {
        saveRememberedLogin(localStorage, REMEMBER_ME_KEY, loginForm.username);
      } else {
        clearRememberedLogin(localStorage, REMEMBER_ME_KEY);
      }
      ElMessage.success('登录成功');
      await router.push(resolveRedirect());
    } catch (err: any) {
      const msg = err?.response?.data?.error || '登录失败';
      ElMessage.error(msg);
      loginSlider.verified = false;
    } finally {
      loading.value = false;
    }
  }

  async function handleRegister() {
    if (!registerForm.username || !registerForm.password) {
      ElMessage.warning('请填写用户名和密码');
      return;
    }
    if (registerForm.password !== registerForm.confirmPassword) {
      ElMessage.warning('两次密码输入不一致');
      return;
    }
    const passwordError = validatePasswordAgainstPolicy(registerForm.password, passwordPolicy.value);
    if (passwordError) {
      ElMessage.warning(passwordError);
      return;
    }
    if (!registerSlider.verified) {
      ElMessage.warning('请完成滑块验证');
      return;
    }
    if (!agreeTerms.value) {
      ElMessage.warning('请阅读并同意用户协议和隐私政策');
      return;
    }
    if (!registerForm.phone.trim()) {
      ElMessage.warning('请输入手机号');
      return;
    }
    if (!/^1\d{10}$/.test(registerForm.phone.trim())) {
      ElMessage.warning('手机号格式不正确，请输入11位手机号');
      return;
    }
    loading.value = true;
    try {
      await authStore.register(
        registerForm.username,
        registerForm.password,
        registerForm.phone.trim(),
        undefined,
        registerSlider.challengeId,
        registerSlider.position,
        registerSlider.duration,
      );
      ElMessage.success(`注册成功，欢迎加入${brand.displayName}`);
      await router.push(resolveRedirect());
    } catch (err: any) {
      const msg = err?.response?.data?.error || '注册失败';
      ElMessage.error(msg);
      registerSlider.verified = false;
    } finally {
      loading.value = false;
    }
  }

  return {
    activeTab,
    loading,
    agreeTerms,
    showTermsDialog,
    passwordPolicyHint,
    loginSlider,
    registerSlider,
    loginForm,
    registerForm,
    rememberMe,
    onLoginSliderVerified,
    onRegisterSliderVerified,
    onLoginSliderReset,
    onRegisterSliderReset,
    handleLogin,
    handleRegister,
  };
}
