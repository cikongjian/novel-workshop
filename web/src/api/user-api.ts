import { http } from './http';

export interface UserApiPolicy {
  enabled: boolean;
  allowPlatformCache: boolean;
  allowLocalOnly: boolean;
  canManage: boolean;
  role: 'user' | 'admin';
  creatorStatus: 'none' | 'pending' | 'approved' | 'rejected' | 'suspended';
  platformCacheReason?: string;
}

export interface UserApiProfile {
  id: string;
  userId: string;
  scope: 'model' | 'image-generation';
  name: string;
  provider: string;
  model: string;
  baseUrl: string;
  storageMode: 'server' | 'local';
  maskedApiKey: string;
  apiKeyCount: number;
  isDefault: boolean;
  enabled: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertUserApiProfilePayload {
  name: string;
  scope?: 'model' | 'image-generation';
  provider: string;
  model: string;
  baseUrl?: string;
  storageMode: 'server' | 'local';
  apiKey?: string;
  apiKeys?: string[];
  apiKeyCount?: number;
  isDefault?: boolean;
  enabled?: boolean;
}

export interface TestUserApiDraftPayload {
  provider: string;
  model: string;
  baseUrl?: string;
  scope?: 'model' | 'image-generation';
  storageMode: 'server' | 'local';
  apiKey?: string;
  apiKeys?: string[];
}

export interface TestUserApiProfileResult {
  success: boolean;
  reply?: string;
  model?: string;
  elapsed?: number;
  imageUrl?: string;
  error?: string;
}

export const userApiApi = {
  getPolicy: () =>
    http.get<UserApiPolicy>('/auth/user-api/policy').then((response) => response.data),

  listProfiles: () =>
    http.get<UserApiProfile[]>('/auth/user-api/profiles').then((response) => response.data),

  createProfile: (payload: UpsertUserApiProfilePayload) =>
    http.post<UserApiProfile>('/auth/user-api/profiles', payload).then((response) => response.data),

  updateProfile: (profileId: string, payload: UpsertUserApiProfilePayload) =>
    http.put<UserApiProfile>(`/auth/user-api/profiles/${profileId}`, payload).then((response) => response.data),

  deleteProfile: (profileId: string) =>
    http.delete<{ ok: boolean }>(`/auth/user-api/profiles/${profileId}`).then((response) => response.data),

  getProfileSecrets: (profileId: string) =>
    http.get<{ apiKeys: string[] }>(`/auth/user-api/profiles/${profileId}/secrets`).then((response) => response.data),

  testDraftProfile: (payload: TestUserApiDraftPayload) =>
    http.post<TestUserApiProfileResult>('/auth/user-api/test-draft', payload).then((response) => response.data),

  testProfile: (profileId: string, payload?: { apiKey?: string; apiKeys?: string[] }) =>
    http.post<TestUserApiProfileResult>(`/auth/user-api/profiles/${profileId}/test`, payload ?? {}).then((response) => response.data),
};
