/**
 * 章节快照类型定义
 *
 * 支持长篇写作的保险机制：
 * - 每章生成前自动快照
 * - 支持回滚到任意已快照的章节
 * - 两阶段确认防误操作
 */

/** 快照元数据 */
export type ChapterSnapshot = {
  /** 快照对应的章节号 */
  chapterNumber: number;
  /** 创建时间 */
  createdAt: string;
  /** 快照包含的文件列表 */
  files: string[];
  /** 快照总大小（字节） */
  sizeBytes: number;
};

/** 回滚影响评估 */
export type RollbackImpact = {
  /** 目标回滚章节 */
  targetChapter: number;
  /** 将被删除的章节号列表 */
  chaptersToDelete: number[];
  /** 将被删除的总数据大小（字节） */
  dataSizeToDelete: number;
  /** 确认 token（用于二次确认） */
  confirmToken: string;
};

/** 回滚执行结果 */
export type RollbackResult = {
  /** 是否成功 */
  success: boolean;
  /** 回滚到的章节号 */
  restoredToChapter: number;
  /** 删除的章节数 */
  deletedChapters: number;
  /** 备份路径 */
  backupPath: string;
};
