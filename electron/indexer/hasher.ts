import fs from 'node:fs';
import { createHash } from 'node:crypto';

/** 流式计算文件内容 SHA-256 指纹，避免整文件载入内存。 */
export function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk: Buffer | string) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
