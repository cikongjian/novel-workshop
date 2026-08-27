import { http } from './http';

export interface LoginPayload {
  username: string;
  password: string;
  sliderChallengeId: string;
  sliderPosition: number;
  sliderDuration: number;
}

export interface RegisterPayload {
  username: string;
  password: string;
  phone: string;
  inviteCode?: string;
  referralCode?: string;
  sliderChallengeId: string;
  sliderPosition: number;
  sliderDuration: number;
}

export interface CaptchaResponse {
  captchaId: string;
  captchaSvg: string;
  expiresIn: number;
}

export type CreatorStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'suspended';

export interface AuthTokens {
  accessToken: string;
}

export interface AuthUserInfo {
  id: string;
  username: string;
  role: 'user' | 'admin';
  creatorStatus?: CreatorStatus;
}

export interface UserProfile extends AuthUserInfo {
  creatorStatus: CreatorStatus;
  creatorAppliedAt: string | null;
  creatorApprovedAt: string | null;
  creatorRejectedAt: string | null;
  creatorRejectReason: string | null;
  realNameVerified: boolean;
  realNameVerifiedAt: string | null;
  realNameMasked: string | null;
  realNameIdNumberMasked: string | null;
  realNamePhoneMasked: string | null;
  penName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  email: string | null;
  createdAt: string;
}

export interface UpdateProfilePayload {
  penName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  email?: string | null;
}

export interface ChangePasswordPayload {
  oldPassword: string;
  newPassword: string;
}

export interface ForgotPasswordPayload {
  username: string;
  phone: string;
  newPassword: string;
  sliderChallengeId: string;
  sliderPosition: number;
  sliderDuration: number;
}

export interface ChangeUsernamePayload {
  currentPassword: string;
  newUsername: string;
}

export interface RedeemCreatorInvitePayload {
  inviteCode: string;
}

export interface CreatorApplicationPayload {
  penName: string;
  email: string;
  bio?: string;
  reason: string;
  sampleWork?: string;
}

export type CreatorApplicationReviewStatus = 'approved' | 'rejected';

export interface CreatorApplicationRecord {
  id: string;
  userId: string;
  username: string;
  penName: string;
  email: string;
  bio: string | null;
  reason: string;
  sampleWork: string | null;
  status: 'pending' | 'approved' | 'rejected';
  adminNote: string | null;
  reviewedBy: string | null;
  reviewedByUsername: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatorApplicationListResult {
  items: CreatorApplicationRecord[];
  total: number;
}

export interface PasswordPolicy {
  minLength: number;
  requireLowercase: boolean;
  requireUppercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
}

export interface RealNamePolicy {
  enabled: boolean;
  provider: 'basic_submission' | 'mock_identity' | 'http_bridge';
  requiredForComment: boolean;
  requiredForCreatorApplication: boolean;
  requiredForBookPublishing: boolean;
  requiredForBilling: boolean;
  maxFailedAttempts: number;
  cooldownMinutes: number;
}

export interface RealNameVerificationPayload {
  realName: string;
  idNumber: string;
  phoneNumber: string;
}

export interface AuthLoginResponse extends AuthTokens {
  user: AuthUserInfo;
}

export interface InviteCodeInfo {
  code: string;
  created_by: string;
  used_by: string | null;
  used_by_username: string | null;
  used_at: string | null;
  created_at: string;
}

export interface AdminUserListItem {
  id: string;
  username: string;
  penName: string | null;
  phone: string | null;
  role: 'user' | 'admin';
  status: 'active' | 'disabled';
  creatorStatus: CreatorStatus;
  creatorAppliedAt: string | null;
  creatorApprovedAt: string | null;
  totalGeneratedWords: number;
  balancePoints: number;
  frozenPoints: number;
  quotaUsed: number;
  quotaTotal: number;
  quotaRemaining: number;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface AdminUserListResponse {
  items: AdminUserListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminUserRecentNovel {
  id: string;
  title: string;
  genre: string;
  status: string;
  chapterCount: number;
  totalWords: number;
  updatedAt: string;
}

export interface AdminUserRecentOrder {
  id: string;
  title: string;
  channel: 'demo' | 'alipay' | 'wechat';
  paymentScene: 'demo' | 'alipay.page' | 'wechat.native' | 'wechat.h5';
  status: 'created' | 'paid' | 'failed' | 'closed' | 'refunded';
  amountCny: number;
  totalPoints: number;
  createdAt: string;
  paidAt: string | null;
}

export interface AdminUserReferralSummary {
  referralCode: string;
  quotaUsed: number;
  quotaTotal: number;
  activeCount: number;
  rechargedCount: number;
  totalRegisterRewardPoints: number;
  totalCommissionPoints: number;
  pendingCommissionPoints: number;
  flaggedEvents: number;
}

export interface AdminUserInsights {
  profile: UserProfile & {
    status: 'active' | 'disabled';
    updatedAt: string;
  };
  creation: {
    novelCount: number;
    completedNovelCount: number;
    publishedNovelCount: number;
    chapterCount: number;
    totalWords: number;
    averageWordsPerChapter: number;
    topGenres: Array<{ genre: string; count: number }>;
    recentNovels: AdminUserRecentNovel[];
  };
  activity: {
    lastActiveAt: string | null;
    activeDays7: number;
    activeDays30: number;
    preferredActivePeriod: string;
    preferredPaymentScene: string;
    recentActivitySources: string[];
    behaviorTags: string[];
    inferenceBasis: string;
  };
  billing: {
    balancePoints: number;
    frozenPoints: number;
    lifetimeRechargePoints: number;
    lifetimeRechargeCny: number;
    ledgerIncomePoints: number;
    ledgerExpensePoints: number;
    recentOrders: AdminUserRecentOrder[];
  };
  referral: AdminUserReferralSummary | null;
  apiProfiles: {
    total: number;
    enabledCount: number;
    defaultProfileName: string | null;
    defaultProvider: string | null;
    lastUsedAt: string | null;
    localStorageCount: number;
    serverStorageCount: number;
    recentProfiles: Array<{
      id: string;
      name: string;
      provider: string;
      model: string;
      storageMode: 'server' | 'local';
      isDefault: boolean;
      enabled: boolean;
      lastUsedAt: string | null;
    }>;
  };
  operational: {
    riskFlags: string[];
    notes: string[];
  };
}

export interface AdminCostOverviewTrendPoint {
  date: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;
  deepSeekTokens: number;
  deepSeekCost: number;
  operationCount: number;
  userCount: number;
  novelCount: number;
}

export interface AdminCostOverviewUserItem {
  userId: string;
  username: string;
  penName: string | null;
  role: 'user' | 'admin';
  status: 'active' | 'disabled';
  novelCount: number;
  totalGeneratedWords: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;
  deepSeekTokens: number;
  deepSeekCost: number;
  lastActivityAt: string | null;
}

export interface AdminCostOverviewNovelItem {
  novelId: string;
  title: string;
  ownerId: string;
  ownerName: string;
  totalGeneratedWords: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;
  deepSeekTokens: number;
  deepSeekCost: number;
  lastActivityAt: string | null;
}

export interface AdminCostOverview {
  generatedAt: string;
  totals: {
    userCount: number;
    creatorCount: number;
    activeUsers30d: number;
    novelCount: number;
    totalGeneratedWords: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    totalCost: number;
    deepSeekTokens: number;
    deepSeekCost: number;
  };
  trends: AdminCostOverviewTrendPoint[];
  users: AdminCostOverviewUserItem[];
  topNovels: AdminCostOverviewNovelItem[];
}

export interface TrialAccountMeta {
  userId: string;
  username: string;
  password: string;
  initialPoints: number;
  trialQuotaChars: number;
  expiresAt: string;
  createdAt: string;
  createdBy: string;
}

export interface CreateTrialAccountsPayload {
  count: number;
  initialPoints: number;
  trialQuotaChars: number;
  expiresAt: string;
  password?: string;
}

export interface CreateTrialAccountsResult {
  accounts: TrialAccountMeta[];
}

export interface TrialAccountListResult {
  accounts: TrialAccountMeta[];
}

export const authApi = {
  getCaptcha: () =>
    http.get<CaptchaResponse>('/captcha/generate').then((r) => r.data),

  login: (data: LoginPayload) =>
    http.post<AuthLoginResponse>('/auth/login', data).then((r) => r.data),

  register: (data: RegisterPayload) =>
    http.post<AuthLoginResponse>('/auth/register', data).then((r) => r.data),

  logout: () =>
    http.post('/auth/logout', {}),

  me: () =>
    http.get<AuthUserInfo>('/auth/me').then((r) => r.data),

  createInviteCode: (count = 1) =>
    http.post<{ codes: string[] }>('/auth/invite-codes', { count }).then((r) => r.data),

  listInviteCodes: () =>
    http.get<InviteCodeInfo[]>('/auth/invite-codes').then((r) => r.data),

  deleteInviteCodes: (codes: string[]) =>
    http.delete<{ deleted: number }>('/auth/invite-codes', { data: { codes } }).then((r) => r.data),

  listUsers: (params?: { keyword?: string; limit?: number; offset?: number }) =>
    http.get<AdminUserListResponse>('/auth/users', { params }).then((r) => r.data),

  getAdminUserInsights: (userId: string) =>
    http.get<AdminUserInsights>(`/auth/users/${userId}/insights`).then((r) => r.data),

  getAdminCostOverview: () =>
    http.get<AdminCostOverview>('/auth/admin/cost-overview').then((r) => r.data),

  setUserStatus: (userId: string, status: 'active' | 'disabled') =>
    http.patch<{ ok: boolean }>(`/auth/users/${userId}/status`, { status }).then((r) => r.data),

  reviewCreatorStatus: (userId: string, status: Exclude<CreatorStatus, 'pending'>, rejectReason?: string | null) =>
    http.patch<UserProfile>(`/auth/users/${userId}/creator-status`, { status, rejectReason }).then((r) => r.data),

  deleteUser: (userId: string) =>
    http.delete<{ ok: boolean }>(`/auth/users/${userId}`).then((r) => r.data),

  getProfile: () =>
    http.get<UserProfile>('/auth/profile').then((r) => r.data),

  getRealNamePolicy: () =>
    http.get<RealNamePolicy>('/auth/real-name/policy').then((r) => r.data),

  getPasswordPolicy: () =>
    http.get<PasswordPolicy>('/auth/password-policy').then((r) => r.data),

  verifyRealName: (data: RealNameVerificationPayload) =>
    http.post<UserProfile>('/auth/real-name/verify', data).then((r) => r.data),

  updateProfile: (data: UpdateProfilePayload) =>
    http.patch<UserProfile>('/auth/profile', data).then((r) => r.data),

  applyCreator: (data: CreatorApplicationPayload) =>
    http.post<UserProfile>('/auth/creator-applications', data).then((r) => r.data),

  listCreatorApplications: (params?: { status?: 'pending' | 'approved' | 'rejected'; userId?: string; page?: number; pageSize?: number }) =>
    http.get<CreatorApplicationListResult>('/auth/creator-applications', { params }).then((r) => r.data),

  reviewCreatorApplication: (applicationId: string, data: { status: CreatorApplicationReviewStatus; adminNote?: string }) =>
    http.post<{ application: CreatorApplicationRecord; profile: UserProfile }>(`/auth/creator-applications/${applicationId}/review`, data).then((r) => r.data),

  redeemCreatorInviteCode: (data: RedeemCreatorInvitePayload) =>
    http.post<UserProfile>('/auth/creator-invite/redeem', data).then((r) => r.data),

  changePassword: (data: ChangePasswordPayload) =>
    http.post<{ ok: boolean }>('/auth/change-password', data).then((r) => r.data),

  forgotPassword: (data: ForgotPasswordPayload) =>
    http.post<{ ok: boolean; message: string }>('/auth/forgot-password', data).then((r) => r.data),

  changeUsername: (data: ChangeUsernamePayload) =>
    http.post<{ ok: boolean }>('/auth/change-username', data).then((r) => r.data),

  // 体验账号
  createTrialAccounts: (data: CreateTrialAccountsPayload) =>
    http.post<CreateTrialAccountsResult>('/auth/admin/trial-accounts', data).then((r) => r.data),

  listTrialAccounts: () =>
    http.get<TrialAccountListResult>('/auth/admin/trial-accounts').then((r) => r.data),

  deleteTrialAccount: (userId: string) =>
    http.delete<{ ok: boolean }>(`/auth/admin/trial-accounts/${userId}`).then((r) => r.data),

  setTrialAccountStatus: (userId: string, status: 'active' | 'disabled') =>
    http.patch<{ ok: boolean }>(`/auth/admin/trial-accounts/${userId}/status`, { status }).then((r) => r.data),
};
