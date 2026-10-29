import fs from 'node:fs';
import path from 'node:path';

export type Resolver = (p: string) => string;

/** 系统目录前缀（Windows 与 macOS 常见系统位置） */
const SYSTEM_PREFIXES = [
  process.env.SystemRoot ?? 'C:\\Windows',
  process.env.ProgramFiles,
  process.env['ProgramFiles(x86)'],
  process.env.ProgramData,
  '/System',
  '/Library',
  '/usr',
  '/bin',
  '/sbin',
  '/etc',
].filter(Boolean) as string[];

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function isSystemPath(p: string): boolean {
  return SYSTEM_PREFIXES.some((sys) => p === sys || isInside(p, sys));
}

/**
 * Task 5.2 — 路径 ACL。
 * 校验 source/target 均位于授权根内（realpath 解析后），
 * 拒绝跨盘符、系统目录、以及 symlink 逃逸出授权根。
 * 违规时抛出带原因的错误；全部通过则静默返回。
 */
export function createAcl(resolve: Resolver = fs.realpathSync.native) {
  return function assertAllowed(root: string, source: string, target: string): void {
    const resolvedRoot = resolve(root);

    // 跨盘符：原始绝对路径的盘根不一致（Windows 下有效）。
    const sourceRoot = path.parse(source).root;
    const targetRoot = path.parse(target).root;
    if (sourceRoot && targetRoot && sourceRoot.toLowerCase() !== targetRoot.toLowerCase()) {
      throw new Error('跨盘符操作被拒绝');
    }

    const resolvedSource = resolve(source);
    const resolvedTarget = resolveExistingAncestor(target, resolve);

    if (isSystemPath(resolvedSource) || isSystemPath(resolvedTarget)) {
      throw new Error('系统目录被拒绝');
    }
    if (!isInside(resolvedSource, resolvedRoot)) {
      throw new Error('源文件不在授权根内');
    }
    if (!isInside(resolvedTarget, resolvedRoot)) {
      throw new Error('目标目录不在授权根内');
    }
  };
}

/** 目标可能尚不存在：解析其最近的已存在祖先。 */
function resolveExistingAncestor(p: string, resolve: Resolver): string {
  let current = p;
  for (;;) {
    try {
      return resolve(current);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return resolve(p); // 兜底：抛出原始错误
      current = parent;
    }
  }
}

export const assertAllowed = createAcl();
