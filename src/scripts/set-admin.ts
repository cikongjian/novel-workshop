#!/usr/bin/env tsx
/**
 * 设置用户为管理员
 *
 * 用法：
 *   npm run cli -- dev set-admin <username>
 */

import type { Pool } from 'mysql2/promise';

interface AuthDb {
  getConnection(): Promise<Pool>;
}

export async function main(args: string[], authDb: AuthDb): Promise<void> {
  if (args[0] === 'set-admin' && args.length < 2) {
    console.log('设置用户为管理员');
    console.log('');
    console.log('用法: npm run cli -- dev set-admin <username>');
    console.log('');
    console.log('示例: npm run cli -- dev set-admin admin');
    return;
  }

  if (args[0] === 'set-admin') {
    const username = args[1];

    try {
      const conn = await authDb.getConnection();

      // 检查用户是否存在
      const [rows] = await conn.query(
        'SELECT id, username, role FROM users WHERE username = ?',
        [username]
      );

      const users = rows as Array<{ id: string; username: string; role: string }>;

      if (users.length === 0) {
        console.error(`❌ 用户 "${username}" 不存在`);
        process.exit(1);
      }

      const user = users[0];
      console.log(`找到用户: ${user.username} (当前角色: ${user.role})`);

      // 如果已经是管理员，提示用户
      if (user.role === 'admin') {
        console.log(`ℹ️  用户 "${username}" 已经是管理员，无需修改`);
        console.log('');
        console.log('请重新登录以刷新管理员权限');
        return;
      }

      // 更新角色为 admin
      await conn.query(
        'UPDATE users SET role = ? WHERE username = ?',
        ['admin', username]
      );

      console.log(`✅ 用户 "${username}" 已设置为管理员`);
      console.log('');
      console.log('请重新登录以获取管理员权限');

    } catch (err) {
      console.error('❌ 设置管理员失败:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  } else {
    console.error('未知命令:', args[0]);
    console.log('可用命令: set-admin');
    process.exit(1);
  }
}
