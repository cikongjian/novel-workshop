/**
 * 数据备份与恢复管理器
 *
 * 使用 Node.js 内置 zlib + fs 实现 tar.gz 打包，不引入外部依赖。
 * 备份存储在 data/backups/{novelId}/{timestamp}.tar.gz
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { createGzip, createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createLogger } from '../utils/logger.js';
import { getNovelStorageCandidates, resolveNovelStorageDir } from '../novel/data-root.js';

const log = createLogger('backup');

export interface BackupInfo {
  id: string;
  novelId: string;
  filename: string;
  size: number;
  createdAt: string;
  novelTitle?: string;
}

export class BackupManager {
  private readonly dataDir: string;
  private readonly maxBackupsPerNovel: number;

  constructor(dataDir: string, options?: { maxBackupsPerNovel?: number; autoBackupOnDelete?: boolean } | number) {
    this.dataDir = dataDir;
    if (typeof options === 'number') {
      this.maxBackupsPerNovel = options;
    } else {
      this.maxBackupsPerNovel = options?.maxBackupsPerNovel ?? 10;
    }
  }

  private getBackupDir(novelId: string): string {
    return path.join(this.dataDir, 'backups', novelId);
  }

  private getNovelsRoot(): string {
    return path.join(this.dataDir, 'novels');
  }

  private getNovelDir(novelId: string): string {
    return resolveNovelStorageDir(this.getNovelsRoot(), novelId);
  }

  private getNewNovelDir(novelId: string): string {
    return getNovelStorageCandidates(this.getNovelsRoot(), novelId).directDir;
  }

  private async listStoredNovelIds(): Promise<string[]> {
    const candidateParents = [
      this.getNovelsRoot(),
      path.join(this.getNovelsRoot(), 'novels'),
    ];
    const ids = new Set<string>();

    for (const parent of candidateParents) {
      let entries: fsSync.Dirent[];
      try {
        entries = await fs.readdir(parent, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (entry.isDirectory() && /^[0-9a-f]{8}-/i.test(entry.name)) {
          ids.add(entry.name);
        }
      }
    }

    return [...ids];
  }

  /**
   * 创建小说备份
   * 将小说目录下所有 JSON/MD 文件打包为 gzip 压缩的 tar 归档
   */
  async createBackup(novelId: string): Promise<BackupInfo> {
    const novelDir = this.getNovelDir(novelId);

    // 验证小说目录存在
    try {
      await fs.access(novelDir);
    } catch {
      throw new Error(`小说目录不存在: ${novelId}`);
    }

    const backupDir = this.getBackupDir(novelId);
    await fs.mkdir(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${timestamp}.tar.gz`;
    const backupPath = path.join(backupDir, filename);

    // 收集所有需要备份的文件
    const files = await this.collectFiles(novelDir, novelDir);
    if (files.length === 0) {
      throw new Error(`小说目录为空: ${novelId}`);
    }

    // 创建简易 tar 归档并 gzip 压缩
    const tarBuffer = this.createTarArchive(files);
    const gzipStream = createGzip({ level: 6 });
    const outputStream = fsSync.createWriteStream(backupPath);

    await pipeline(Readable.from(tarBuffer), gzipStream, outputStream);

    const stat = await fs.stat(backupPath);

    // 读取小说标题
    let novelTitle: string | undefined;
    try {
      const novelJson = JSON.parse(await fs.readFile(path.join(novelDir, 'novel.json'), 'utf-8'));
      novelTitle = novelJson.title;
    } catch { /* ignore */ }

    log.info('备份创建成功', { novelId, filename, size: stat.size });

    // 清理旧备份
    await this.cleanOldBackups(novelId);

    return {
      id: timestamp,
      novelId,
      filename,
      size: stat.size,
      createdAt: new Date().toISOString(),
      novelTitle,
    };
  }

  /**
   * 恢复备份
   */
  async restoreBackup(novelId: string, backupId: string): Promise<void> {
    const backupDir = this.getBackupDir(novelId);
    const filename = `${backupId}.tar.gz`;
    const backupPath = path.join(backupDir, filename);

    try {
      await fs.access(backupPath);
    } catch {
      throw new Error(`备份文件不存在: ${filename}`);
    }

    const novelDir = this.getNovelDir(novelId);

    // 解压 gzip
    const compressed = await fs.readFile(backupPath);
    const decompressed = await this.gunzipBuffer(compressed);

    // 解析 tar 并恢复文件
    const files = this.parseTarArchive(decompressed);

    // 确保目标目录存在
    await fs.mkdir(novelDir, { recursive: true });

    for (const file of files) {
      // 防止路径遍历攻击
      const normalized = path.normalize(file.name);
      if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
        log.warn('跳过可疑路径', { name: file.name });
        continue;
      }
      const targetPath = path.join(novelDir, normalized);
      if (!targetPath.startsWith(novelDir)) {
        log.warn('跳过路径遍历', { name: file.name, targetPath });
        continue;
      }
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, file.data);
    }

    log.info('备份恢复成功', { novelId, backupId, fileCount: files.length });
  }

  /**
   * 列出指定小说的所有备份
   */
  async listBackups(novelId?: string): Promise<BackupInfo[]> {
    const results: BackupInfo[] = [];
    const backupsRoot = path.join(this.dataDir, 'backups');

    try {
      await fs.access(backupsRoot);
    } catch {
      return results;
    }

    const novelIds = novelId
      ? [novelId]
      : await fs.readdir(backupsRoot).catch(() => [] as string[]);

    for (const nid of novelIds) {
      const dir = path.join(backupsRoot, nid);
      let entries: string[];
      try {
        entries = await fs.readdir(dir);
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (!entry.endsWith('.tar.gz')) continue;
        const filePath = path.join(dir, entry);
        try {
          const stat = await fs.stat(filePath);
          const id = entry.replace('.tar.gz', '');
          results.push({
            id,
            novelId: nid,
            filename: entry,
            size: stat.size,
            createdAt: stat.birthtime.toISOString(),
          });
        } catch { /* skip */ }
      }
    }

    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * 删除备份
   */
  async deleteBackup(novelId: string, backupId: string): Promise<void> {
    const backupPath = path.join(this.getBackupDir(novelId), `${backupId}.tar.gz`);
    await fs.unlink(backupPath);
    log.info('备份已删除', { novelId, backupId });
  }

  /**
   * 导出小说为 tar.gz Buffer（用于下载迁移）。
   * 与 createBackup 不同，不写入磁盘、不受 maxBackups 限制。
   */
  async exportNovel(novelId: string): Promise<{ buffer: Buffer; title: string }> {
    const novelDir = this.getNovelDir(novelId);
    try {
      await fs.access(novelDir);
    } catch {
      throw new Error(`小说目录不存在: ${novelId}`);
    }

    const files = await this.collectFiles(novelDir, novelDir);
    if (files.length === 0) {
      throw new Error(`小说目录为空: ${novelId}`);
    }

    const tarBuffer = this.createTarArchive(files);
    const compressed = await this.gzipBuffer(tarBuffer);

    let title = novelId;
    try {
      const novelJson = JSON.parse(await fs.readFile(path.join(novelDir, 'novel.json'), 'utf-8'));
      title = novelJson.title || title;
    } catch { /* use novelId as fallback title */ }

    log.info('小说导出成功', { novelId, title, size: compressed.length, fileCount: files.length });
    return { buffer: compressed, title };
  }

  /**
   * 从 tar.gz Buffer 导入小说（新建小说目录）。
   * 返回导入后的 novelId 和标题。
   */
  async importNovel(data: Buffer): Promise<{ novelId: string; title: string }> {
    const decompressed = await this.gunzipBuffer(data);
    const files = this.parseTarArchive(decompressed);

    if (files.length === 0) {
      throw new Error('导入文件为空');
    }

    // 验证必须包含 novel.json
    if (!files.some(f => f.name === 'novel.json')) {
      throw new Error('导入文件缺少 novel.json，不是有效的小说归档');
    }

    return this.importNovelFromFiles(files);
  }

  /**
   * 批量导出所有小说为单个 tar.gz Buffer。
   * 归档结构：{novelId}/novel.json, {novelId}/chapters/... 每个小说一个子目录。
   */
  async exportAllNovels(): Promise<{ buffer: Buffer; count: number }> {
    const novelIds = await this.listStoredNovelIds();

    const allFiles: Array<{ name: string; data: Buffer }> = [];
    let count = 0;

    for (const novelId of novelIds) {
      const novelDir = this.getNovelDir(novelId);
      const stat = await fs.stat(novelDir).catch(() => null);
      if (!stat?.isDirectory()) continue;

      // 确认是有效小说目录（有 novel.json）
      try {
        await fs.access(path.join(novelDir, 'novel.json'));
      } catch {
        continue;
      }

      const files = await this.collectFiles(novelDir, novelDir);
      // 给每个文件名加上 novelId 前缀
      for (const file of files) {
        allFiles.push({ name: `${novelId}/${file.name}`, data: file.data });
      }
      count++;
    }

    if (count === 0) {
      throw new Error('没有可导出的小说');
    }

    const tarBuffer = this.createTarArchive(allFiles);
    const compressed = await this.gzipBuffer(tarBuffer);

    log.info('批量导出成功', { count, size: compressed.length, fileCount: allFiles.length });
    return { buffer: compressed, count };
  }

  /**
   * 从批量归档导入所有小说。
   * 自动检测归档结构：如果根层有 novel.json 则为单本，否则按子目录拆分。
   */
  async importAllNovels(data: Buffer): Promise<Array<{ novelId: string; title: string }>> {
    const decompressed = await this.gunzipBuffer(data);
    const files = this.parseTarArchive(decompressed);

    if (files.length === 0) {
      throw new Error('导入文件为空');
    }

    // 检测结构：根层有 novel.json → 单本导入
    const hasRootNovelJson = files.some(f => f.name === 'novel.json');
    if (hasRootNovelJson) {
      const result = await this.importNovelFromFiles(files);
      return [result];
    }

    // 按第一层目录分组
    const groups = new Map<string, Array<{ name: string; data: Buffer }>>();
    for (const file of files) {
      const slashIdx = file.name.indexOf('/');
      if (slashIdx < 0) continue; // 跳过根层非目录文件
      const dirName = file.name.substring(0, slashIdx);
      const relativeName = file.name.substring(slashIdx + 1);
      if (!relativeName) continue;
      if (!groups.has(dirName)) groups.set(dirName, []);
      groups.get(dirName)!.push({ name: relativeName, data: file.data });
    }

    const results: Array<{ novelId: string; title: string }> = [];
    for (const [dirName, groupFiles] of groups) {
      if (!groupFiles.some(f => f.name === 'novel.json')) {
        log.warn('批量导入跳过无 novel.json 的目录', { dirName });
        continue;
      }
      try {
        const result = await this.importNovelFromFiles(groupFiles);
        results.push(result);
      } catch (err) {
        log.warn('批量导入单本失败', { dirName, error: String(err) });
      }
    }

    if (results.length === 0) {
      throw new Error('归档中未找到有效的小说数据');
    }

    log.info('批量导入成功', { count: results.length });
    return results;
  }

  /**
   * 从已解析的文件列表导入单本小说（importNovel 的内部复用版本）。
   */
  private async importNovelFromFiles(
    files: Array<{ name: string; data: Buffer }>,
  ): Promise<{ novelId: string; title: string }> {
    const novelJsonFile = files.find(f => f.name === 'novel.json');
    if (!novelJsonFile) {
      throw new Error('缺少 novel.json');
    }

    let originalMeta: Record<string, unknown>;
    try {
      originalMeta = JSON.parse(novelJsonFile.data.toString('utf-8'));
    } catch {
      throw new Error('novel.json 格式无效');
    }

    const newId = crypto.randomUUID();
    const title = typeof originalMeta.title === 'string' ? originalMeta.title : '导入的小说';

    // 保留 syncId 用于跨实例匹配；如果原数据没有 syncId，用原始 id 作为 syncId
    if (!originalMeta.syncId && typeof originalMeta.id === 'string') {
      originalMeta.syncId = originalMeta.id;
    }
    originalMeta.id = newId;
    originalMeta.updatedAt = new Date().toISOString();
    const updatedNovelJson = Buffer.from(JSON.stringify(originalMeta, null, 2), 'utf-8');

    const novelDir = this.getNewNovelDir(newId);
    await fs.mkdir(novelDir, { recursive: true });

    for (const file of files) {
      const normalized = path.normalize(file.name);
      if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
        log.warn('导入跳过可疑路径', { name: file.name });
        continue;
      }
      const targetPath = path.join(novelDir, normalized);
      if (!targetPath.startsWith(novelDir)) {
        log.warn('导入跳过路径遍历', { name: file.name });
        continue;
      }
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      const content = file.name === 'novel.json' ? updatedNovelJson : file.data;
      await fs.writeFile(targetPath, content);
    }

    log.info('小说导入成功', { novelId: newId, title, fileCount: files.length });
    return { novelId: newId, title };
  }

  // ===== 内部方法 =====

  /** 导出时跳过的目录/文件名（均为可重建的衍生数据） */
  private static readonly EXPORT_SKIP_NAMES = new Set([
    'memory.db', 'memory.db-wal', 'memory.db-shm',
    'memory-lance',  // 向量索引
    'tts',           // TTS 音频缓存
    'voices',        // 语音配置缓存
  ]);

  private async collectFiles(
    dir: string,
    baseDir: string,
  ): Promise<Array<{ name: string; data: Buffer }>> {
    const results: Array<{ name: string; data: Buffer }> = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (BackupManager.EXPORT_SKIP_NAMES.has(entry.name)) {
        continue; // 跳过可重建的衍生数据
      }

      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        const subFiles = await this.collectFiles(fullPath, baseDir);
        results.push(...subFiles);
      } else if (entry.isFile()) {
        const data = await fs.readFile(fullPath);
        results.push({ name: relativePath, data });
      }
    }

    return results;
  }

  /**
   * 创建简易 tar 归档（POSIX ustar 格式）
   */
  private createTarArchive(files: Array<{ name: string; data: Buffer }>): Buffer {
    const blocks: Buffer[] = [];

    for (const file of files) {
      // 512 字节头部
      const header = Buffer.alloc(512);
      const nameBytes = Buffer.from(file.name, 'utf-8');
      nameBytes.copy(header, 0, 0, Math.min(nameBytes.length, 100));

      // 文件模式
      Buffer.from('0000644\0', 'ascii').copy(header, 100);
      // uid/gid
      Buffer.from('0001000\0', 'ascii').copy(header, 108);
      Buffer.from('0001000\0', 'ascii').copy(header, 116);
      // 文件大小（八进制）
      const sizeOctal = file.data.length.toString(8).padStart(11, '0') + '\0';
      Buffer.from(sizeOctal, 'ascii').copy(header, 124);
      // 修改时间
      const mtime = Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0';
      Buffer.from(mtime, 'ascii').copy(header, 136);
      // 类型标志：普通文件
      header[156] = 0x30; // '0'
      // ustar 标识
      Buffer.from('ustar\0', 'ascii').copy(header, 257);
      Buffer.from('00', 'ascii').copy(header, 263);

      // 计算校验和
      Buffer.from('        ', 'ascii').copy(header, 148); // 先填空格
      let checksum = 0;
      for (let i = 0; i < 512; i++) checksum += header[i];
      const checksumStr = checksum.toString(8).padStart(6, '0') + '\0 ';
      Buffer.from(checksumStr, 'ascii').copy(header, 148);

      blocks.push(header);
      blocks.push(file.data);

      // 填充到 512 字节边界
      const padding = 512 - (file.data.length % 512);
      if (padding < 512) {
        blocks.push(Buffer.alloc(padding));
      }
    }

    // 结束标记：两个 512 字节零块
    blocks.push(Buffer.alloc(1024));

    return Buffer.concat(blocks);
  }

  /**
   * 解析 tar 归档
   */
  private parseTarArchive(buffer: Buffer): Array<{ name: string; data: Buffer }> {
    const files: Array<{ name: string; data: Buffer }> = [];
    let offset = 0;

    while (offset + 512 <= buffer.length) {
      const header = buffer.subarray(offset, offset + 512);

      // 检查是否为零块（结束标记）
      if (header.every(b => b === 0)) break;

      // 读取文件名
      const nameEnd = header.indexOf(0);
      const name = header.subarray(0, Math.min(nameEnd >= 0 ? nameEnd : 100, 100)).toString('utf-8');

      // 读取文件大小
      const sizeStr = header.subarray(124, 135).toString('ascii').trim();
      const size = parseInt(sizeStr, 8) || 0;

      offset += 512;

      if (name && size > 0) {
        const data = Buffer.from(buffer.subarray(offset, offset + size));
        files.push({ name, data });
      }

      // 跳过数据块（含填充）
      offset += Math.ceil(size / 512) * 512;
    }

    return files;
  }

  private async gzipBuffer(data: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const gzip = createGzip({ level: 6 });
      gzip.on('data', (chunk: Buffer) => chunks.push(chunk));
      gzip.on('end', () => resolve(Buffer.concat(chunks)));
      gzip.on('error', reject);
      gzip.end(data);
    });
  }

  private async gunzipBuffer(compressed: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const gunzip = createGunzip();
      gunzip.on('data', (chunk: Buffer) => chunks.push(chunk));
      gunzip.on('end', () => resolve(Buffer.concat(chunks)));
      gunzip.on('error', reject);
      gunzip.end(compressed);
    });
  }

  private async cleanOldBackups(novelId: string): Promise<void> {
    const backups = await this.listBackups(novelId);
    if (backups.length <= this.maxBackupsPerNovel) return;

    const toDelete = backups.slice(this.maxBackupsPerNovel);
    for (const backup of toDelete) {
      try {
        await this.deleteBackup(novelId, backup.id);
      } catch (err) {
        log.warn('清理旧备份失败', { novelId, backupId: backup.id, error: String(err) });
      }
    }
  }
}
