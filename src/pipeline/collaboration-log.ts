import type { AgentRole } from '../agents/types.js';

export type FeedbackType = 'quality-issue' | 'consistency-fix' | 'style-adjustment' | 'plot-correction';

export type CollaborationEntry = {
  round: number;
  fromAgent: AgentRole;
  toAgent: AgentRole;
  feedbackType: FeedbackType;
  summary: string;
  timestamp: string;
};

export class CollaborationLog {
  private entries: CollaborationEntry[] = [];

  add(entry: Omit<CollaborationEntry, 'timestamp'>): void {
    this.entries.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });
  }

  getEntries(): CollaborationEntry[] {
    return [...this.entries];
  }

  getSummary(): string {
    if (this.entries.length === 0) return '无协作记录';
    const grouped = new Map<string, number>();
    for (const entry of this.entries) {
      const key = `${entry.fromAgent} -> ${entry.toAgent}`;
      grouped.set(key, (grouped.get(key) ?? 0) + 1);
    }
    const parts = [...grouped.entries()].map(([key, count]) => `${key}(${count}次)`);
    return `共 ${this.entries.length} 条协作记录：${parts.join('、')}`;
  }

  clear(): void {
    this.entries = [];
  }
}
