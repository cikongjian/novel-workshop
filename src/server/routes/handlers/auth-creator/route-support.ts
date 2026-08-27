import { z } from 'zod';
import type { AuthDb } from '../../../../auth/types.js';
import type { ComplianceEventManager } from '../../../../compliance/compliance-event-manager.js';

export interface AuthCreatorRouteDeps {
  db: AuthDb;
  complianceEventManager?: ComplianceEventManager;
}

export const ReviewCreatorStatusBody = z.object({
  status: z.enum(['none', 'approved', 'rejected', 'suspended']),
  rejectReason: z.string().max(255).nullable().optional(),
});

export const RedeemCreatorInviteBody = z.object({
  inviteCode: z.string().trim().min(1).max(32),
});

export const SubmitCreatorApplicationBody = z.object({
  penName: z.string().trim().min(2).max(50),
  email: z.string().trim().email().max(255),
  bio: z.string().trim().max(300).optional().or(z.literal('')),
  reason: z.string().trim().min(10).max(1000),
  sampleWork: z.string().trim().max(2000).optional().or(z.literal('')),
});

export const ListCreatorApplicationsQuery = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  userId: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const ReviewCreatorApplicationBody = z.object({
  status: z.enum(['approved', 'rejected']),
  adminNote: z.string().trim().max(500).optional().or(z.literal('')),
});
