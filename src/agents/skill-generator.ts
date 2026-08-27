/**
 * 技能生成大师 Agent
 *
 * 根据用户的写作需求，生成定制化的 Agent 技能定义。
 * 每次调用消耗积分（默认99积分，后台可配置）。
 */

import type { ModelClient } from '../models/types.js';
import type { AgentSkillDefinition } from '../agent-skills/types.js';

export type SkillGeneratorInput = {
  requirement: string;
  targetGenre?: string;
  targetRoles?: string[];
  novelContext?: {
    title?: string;
    genre?: string;
    outline?: string;
    worldSetting?: string;
  };
};

export type SkillGeneratorOutput = {
  skill: AgentSkillDefinition;
  reasoning: string;
};

export class SkillGeneratorAgent {
  readonly role = 'skill-generator' as const;
  readonly name = '技能生成大师';
  readonly description = '根据用户需求生成定制化的 Agent 技能定义';

  constructor(private modelClient: ModelClient) {}

  async generate(input: SkillGeneratorInput): Promise<SkillGeneratorOutput> {
    const context = this.buildContext(input);
    const response = await this.callModel(context);
    return this.parseResponse(response, input);
  }

  private async callModel(userMessage: string): Promise<string> {
    const systemPrompt = await this.loadPromptTemplate();
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];
    const response = await this.modelClient.chat(messages, { temperature: 0.7, maxTokens: 4096 });
    return response.content;
  }

  private async loadPromptTemplate(): Promise<string> {
    const { readFile } = await import('node:fs/promises');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const dir = dirname(fileURLToPath(import.meta.url));
    const promptPath = join(dir, 'prompts', 'skill-generator.txt');
    return readFile(promptPath, 'utf-8');
  }

  private buildContext(input: SkillGeneratorInput): string {
    const parts: string[] = [];

    parts.push('# 用户需求');
    parts.push(input.requirement);
    parts.push('');

    if (input.targetGenre) {
      parts.push(`# 目标题材: ${input.targetGenre}`);
      parts.push('');
    }

    if (input.targetRoles && input.targetRoles.length > 0) {
      parts.push(`# 目标角色: ${input.targetRoles.join(', ')}`);
      parts.push('');
    }

    if (input.novelContext) {
      parts.push('# 小说上下文');
      if (input.novelContext.title) {
        parts.push(`书名: ${input.novelContext.title}`);
      }
      if (input.novelContext.genre) {
        parts.push(`题材: ${input.novelContext.genre}`);
      }
      if (input.novelContext.outline) {
        parts.push(`大纲摘要: ${input.novelContext.outline.slice(0, 500)}`);
      }
      if (input.novelContext.worldSetting) {
        parts.push(`世界设定摘要: ${input.novelContext.worldSetting.slice(0, 500)}`);
      }
      parts.push('');
    }

    return parts.join('\n');
  }

  private parseResponse(response: string, input: SkillGeneratorInput): SkillGeneratorOutput {
    // 尝试提取 JSON 格式的技能定义
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
    let skillData: Partial<AgentSkillDefinition> = {};
    let reasoning = '';

    if (jsonMatch) {
      try {
        skillData = JSON.parse(jsonMatch[1]);
      } catch (e) {
        // JSON 解析失败，使用文本解析
      }
    }

    // 提取推理过程
    const reasoningMatch = response.match(/(?:推理过程|设计思路|Reasoning)[:：]\s*([\s\S]*?)(?=\n\n|```|$)/i);
    if (reasoningMatch) {
      reasoning = reasoningMatch[1].trim();
    } else {
      reasoning = response.slice(0, 300);
    }

    // 提取各个字段（如果 JSON 解析失败）
    if (!skillData.name) {
      const nameMatch = response.match(/(?:技能名称|name)[:：]\s*[「『"]?([^」』"\n]+)[」』"]?/i);
      if (nameMatch) skillData.name = nameMatch[1].trim();
    }

    if (!skillData.description) {
      const descMatch = response.match(/(?:技能描述|description)[:：]\s*([^\n]+)/i);
      if (descMatch) skillData.description = descMatch[1].trim();
    }

    if (!skillData.instruction) {
      const instrMatch = response.match(/(?:执行指令|instruction)[:：]\s*([\s\S]*?)(?=\n\n(?:技能名称|name|description|推理)|```|$)/i);
      if (instrMatch) skillData.instruction = instrMatch[1].trim();
    }

    // 构建完整的技能定义
    const skill: AgentSkillDefinition = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: skillData.name || '自定义技能',
      description: skillData.description || input.requirement.slice(0, 100),
      instruction: skillData.instruction || input.requirement,
      targetRoles: skillData.targetRoles || input.targetRoles || ['writer'],
      targetGenres: skillData.targetGenres || (input.targetGenre ? [input.targetGenre] : ['*']),
      priority: skillData.priority || 80,
      status: 'active',
      activation: 'manual',
      tags: ['custom-generated', ...(skillData.tags || [])],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return { skill, reasoning };
  }
}
