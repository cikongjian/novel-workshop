import { getConfig } from '../config/index.js';
import type { PasswordPolicy } from './types.js';

const SPECIAL_CHAR_REGEX = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?`~]/;

export function getPasswordPolicy(): PasswordPolicy {
  const policy = getConfig().passwordPolicy;
  return {
    minLength: policy.minLength,
    requireLowercase: policy.requireLowercase,
    requireUppercase: policy.requireUppercase,
    requireNumbers: policy.requireNumbers,
    requireSpecialChars: policy.requireSpecialChars,
  };
}

export function validatePasswordAgainstPolicy(password: string, policy: PasswordPolicy): string | null {
  if (password.length < policy.minLength) {
    return `密码至少 ${policy.minLength} 位`;
  }
  if (password.length > 128) {
    return '密码最多 128 位';
  }
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    return '密码必须包含小写字母';
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    return '密码必须包含大写字母';
  }
  if (policy.requireNumbers && !/\d/.test(password)) {
    return '密码必须包含数字';
  }
  if (policy.requireSpecialChars && !SPECIAL_CHAR_REGEX.test(password)) {
    return '密码必须包含特殊字符';
  }
  return null;
}
