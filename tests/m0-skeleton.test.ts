import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { CHANNEL_LIST, IPC } from '../shared/ipc-contract';

const root = process.cwd();

describe('M0 骨架契约', () => {
  it('IPC channel 命名规范：全部以 sift: 前缀', () => {
    for (const ch of CHANNEL_LIST) {
      expect(ch.startsWith('sift:'), `channel ${ch} 应以 sift: 开头`).toBe(true);
    }
  });

  it('IPC channel 无重复', () => {
    const unique = new Set(CHANNEL_LIST);
    expect(unique.size).toBe(CHANNEL_LIST.length);
  });

  it('IPC 对象键与 channel 值一致', () => {
    for (const [key, value] of Object.entries(IPC)) {
      expect(CHANNEL_LIST).toContain(value);
      expect(key).toMatch(/^[a-zA-Z][a-zA-Z0-9]*$/);
    }
  });
});

describe('M0 项目骨架文件', () => {
  it('关键配置文件均存在', () => {
    const files = [
      'package.json',
      'tsconfig.json',
      'tsconfig.main.json',
      'next.config.mjs',
      'vitest.config.mts',
      'eslint.config.mjs',
      '.gitignore',
      '.env.example',
      'electron/main.ts',
      'electron/preload.ts',
      'electron/server.ts',
      'src/app/page.tsx',
      'src/app/health/route.ts',
    ];
    for (const f of files) {
      expect(existsSync(path.join(root, f)), `缺少 ${f}`).toBe(true);
    }
  });

  it('package.json 声明 main 入口与核心脚本', () => {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.main).toBe('dist-electron/main.cjs');
    for (const s of ['dev', 'build', 'build:renderer', 'build:main', 'typecheck', 'test']) {
      expect(pkg.scripts[s], `缺少脚本 ${s}`).toBeTruthy();
    }
  });
});
