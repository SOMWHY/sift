import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAcl, type Resolver } from '../../../electron/executor/acl';

function tmpdir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('assertAllowed (Task 5.2)', () => {
  it('realpath 逃逸出授权根（等价 symlink 指向根外）→ 拒绝', () => {
    // 模拟：source 经 realpath 解析后落在根外（symlink 逃逸的等价路径）
    const resolver: Resolver = (p) =>
      p.includes('escape') ? 'C:\\outside\\secret.txt' : p;
    const assertAllowed = createAcl(resolver);
    expect(() =>
      assertAllowed('C:\\root', 'C:\\root\\escape.txt', 'C:\\root\\sub'),
    ).toThrow(/源文件不在授权根内/);
  });

  it('跨盘符 → 拒绝', () => {
    const resolver: Resolver = (p) => (p.startsWith('D:') ? 'D:\\target\\x' : 'C:\\root\\x');
    const assertAllowed = createAcl(resolver);
    expect(() => assertAllowed('C:\\root', 'C:\\root\\a.txt', 'D:\\target')).toThrow(/盘/);
  });

  it('系统目录 → 拒绝', () => {
    const resolver: Resolver = (p) => p; // 已解析路径原样返回
    const assertAllowed = createAcl(resolver);
    expect(() => assertAllowed('C:\\Users\\me', 'C:\\Users\\me\\a.txt', 'C:\\Windows\\System32')).toThrow(
      /系统/,
    );
  });

  it('授权根内正常 move → 通过', () => {
    const root = tmpdir('sift-acl-ok-');
    try {
      fs.writeFileSync(path.join(root, 'a.txt'), 'x');
      const target = path.join(root, 'archive');
      fs.mkdirSync(target);
      expect(() => createAcl()(root, path.join(root, 'a.txt'), target)).not.toThrow();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('目标在根外 → 拒绝', () => {
    const root = tmpdir('sift-acl-tgt-');
    const outside = tmpdir('sift-acl-out2-');
    try {
      fs.writeFileSync(path.join(root, 'a.txt'), 'x');
      expect(() => createAcl()(root, path.join(root, 'a.txt'), outside)).toThrow(/授权根/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('源文件在根外 → 拒绝', () => {
    const root = tmpdir('sift-acl-src-');
    const outside = tmpdir('sift-acl-out3-');
    try {
      fs.writeFileSync(path.join(outside, 'a.txt'), 'x');
      expect(() => createAcl()(root, path.join(outside, 'a.txt'), root)).toThrow(/授权根/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
