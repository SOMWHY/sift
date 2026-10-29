import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractText } from '../../../electron/indexer/extractor';

function tmpFile(name: string, content: Buffer | string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sift-ext-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
}

/** 构造一个包含指定文本的最小合法 PDF（正确计算 xref 偏移）。 */
function buildPdf(text: string): Buffer {
  const header = '%PDF-1.4\n';
  const objects: Buffer[] = [];
  const offsets: number[] = [];

  const push = (obj: string) => {
    offsets.push(header.length + objects.reduce((n, b) => n + b.length, 0));
    objects.push(Buffer.from(obj, 'binary'));
  };

  push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  push(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R ' +
      '/Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
  );
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  push(`4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`);
  push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

  const body = Buffer.concat(objects);
  const xrefOffset = header.length + body.length;
  let xref = 'xref\n0 6\n0000000000 65535 f \n';
  for (const off of offsets) {
    xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.concat([
    Buffer.from(header, 'binary'),
    body,
    Buffer.from(xref, 'binary'),
    Buffer.from(trailer, 'binary'),
  ]);
}

describe('extractor', () => {
  it('UTF-8 文本返回完整内容', async () => {
    const p = tmpFile('note.txt', '这是 UTF-8 文本');
    await expect(extractText(p, 'text/plain')).resolves.toBe('这是 UTF-8 文本');
  });

  it('非 UTF-8 文本返回空串，不抛异常', async () => {
    const p = tmpFile('latin.txt', Buffer.from([0x63, 0x61, 0x66, 0xe9])); // café 的 latin-1
    await expect(extractText(p, 'text/plain')).resolves.toBe('');
  });

  it('二进制文件（octet-stream）返回空串', async () => {
    const p = tmpFile('blob.bin', Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]));
    await expect(extractText(p, 'application/octet-stream')).resolves.toBe('');
  });

  it('图片 mime 返回空串', async () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(32, 0x00),
    ]);
    const p = tmpFile('img.png', png);
    await expect(extractText(p, 'image/png')).resolves.toBe('');
  });

  it('损坏的 PDF 返回空串，不抛异常', async () => {
    const p = tmpFile('broken.pdf', Buffer.from('%PDF-1.4\ngarbage\n%%EOF'));
    await expect(extractText(p, 'application/pdf')).resolves.toBe('');
  });

  it('合法 PDF 提取文本', async () => {
    const p = tmpFile('ok.pdf', buildPdf('Hello Sift'));
    await expect(extractText(p, 'application/pdf')).resolves.toContain('Hello Sift');
  });

  it('文件不存在返回空串', async () => {
    await expect(extractText('/no/such/file.txt', 'text/plain')).resolves.toBe('');
  });
});
