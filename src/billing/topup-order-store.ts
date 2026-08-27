import type { Database } from 'better-sqlite3';
import { BillingOrder, type BillingOrder as BillingOrderType } from './types.js';
import { getOrder, saveOrder, listOrdersForUser as dbListOrdersForUser } from './billing-db-store.js';

export class BillingTopupOrderStore {
  private readonly db: Database;

  constructor(_dataDir: string, db: Database) {
    this.db = db;
  }

  async getOrder(orderId: string): Promise<BillingOrderType | null> {
    return getOrder(this.db, orderId);
  }

  async saveOrder(order: BillingOrderType): Promise<BillingOrderType> {
    const normalized = BillingOrder.parse(order);
    saveOrder(this.db, normalized);
    return normalized;
  }

  async listOrdersForUser(userId: string, limit = 50): Promise<BillingOrderType[]> {
    return dbListOrdersForUser(this.db, userId, limit);
  }
}
