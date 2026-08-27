import type { PasswordPolicy } from '../api/auth';

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 10,
  requireLowercase: true,
  requireUppercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
};

export function formatPasswordPolicy(policy: PasswordPolicy): string {
  const rules: string[] = [`至少 ${policy.minLength} 位`];
  if (policy.requireLowercase) rules.push('小写字母');
  if (policy.requireUppercase) rules.push('大写字母');
  if (policy.requireNumbers) rules.push('数字');
  if (policy.requireSpecialChars) rules.push('特殊字符');
  return rules.length > 1
    ? `${rules[0]}，需包含${rules.slice(1).join('、')}`
    : rules[0];
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
  if (policy.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?`~]/.test(password)) {
    return '密码必须包含特殊字符';
  }
  return null;
}
