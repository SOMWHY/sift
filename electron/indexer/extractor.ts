import fs from 'node:fs/promises';
import { TextDecoder } from 'node:util';
import { PDFParse } from 'pdf-parse';

/**
 * 可提取全文的文本类 mime。非 UTF-8 或二进制一律返回空串，绝不抛异常，
 * 保证索引管线不因单个坏文件中断（Review Focus #3）。
 */
const TEXT_MIMES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'text/xml',
  'application/json',
  'application/xml',
  'application/javascript',
  'application/x-yaml',
  'text/yaml',
  'application/x-httpd-php',
  'application/x-sh',
]);

const BINARY_PREFIXES = [
  'image/',
  'audio/',
  'video/',
  'font/',
  'application/octet-stream',
  'application/zip',
  'application/gzip',
  'application/x-tar',
  'application/x-7z-compressed',
  'application/x-rar-compressed',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

function isTextMime(mime: string): boolean {
  if (mime.startsWith('text/')) return true;
  return TEXT_MIMES.has(mime);
}

export async function extractText(filePath: string, mime: string | null): Promise<string> {
  try {
    if (!mime) return '';
    if (mime === 'application/pdf') return await extractPdf(filePath);
    if (BINARY_PREFIXES.some((prefix) => mime.startsWith(prefix))) return '';
    if (!isTextMime(mime)) return '';

    const buffer = await fs.readFile(filePath);
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      return '';
    }
  } catch {
    return '';
  }
}

async function extractPdf(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text;
  } catch {
    return '';
  } finally {
    await parser.destroy().catch(() => {});
  }
}
