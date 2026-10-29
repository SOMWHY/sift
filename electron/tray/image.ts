import { nativeImage, type NativeImage } from 'electron';

/**
 * 程序化生成 16×16 托盘图标（无外部资源文件）。
 * - default：灰色圆点
 * - badge：红色圆点（有未读建议时）
 */
export function createTrayImage(kind: 'default' | 'badge'): NativeImage {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4); // BGRA

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = x - 7.5;
      const dy = y - 7.5;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (kind === 'badge' && r <= 6) {
        buf[i] = 0x44; // B
        buf[i + 1] = 0x52; // G
        buf[i + 2] = 0xf0; // R → #f05244
        buf[i + 3] = 0xff; // A
      } else if (kind === 'default' && r <= 7) {
        buf[i] = 0x8a; // B
        buf[i + 1] = 0x8a; // G
        buf[i + 2] = 0x8a; // R → 灰
        buf[i + 3] = 0xff; // A
      }
    }
  }

  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}
