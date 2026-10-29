// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArchivePreview } from '../../../src/components/ArchivePreview';
import type { ArchiveDryRunEntry } from '../../../shared/ipc-contract';

function entry(partial: Partial<ArchiveDryRunEntry> = {}): ArchiveDryRunEntry {
  return {
    sourcePath: 'C:\\root\\a.pdf',
    targetPath: 'C:\\root\\archive\\a.pdf',
    opType: 'move',
    lowConfidence: false,
    blocked: false,
    ...partial,
  };
}

describe('ArchivePreview (Task 5.3)', () => {
  it('预览逐条渲染 source → target 路径', () => {
    render(
      <ArchivePreview
        entries={[
          entry({ sourcePath: 'C:\\root\\a.pdf', targetPath: 'C:\\root\\archive\\a.pdf' }),
          entry({ sourcePath: 'C:\\root\\b.pdf', targetPath: 'C:\\root\\archive\\b.pdf' }),
        ]}
      />,
    );
    expect(screen.getByText(/C:\\root\\a\.pdf/)).toBeTruthy();
    expect(screen.getByText(/C:\\root\\archive\\a\.pdf/)).toBeTruthy();
    expect(screen.getByText(/C:\\root\\b\.pdf/)).toBeTruthy();
    expect(screen.getByText(/C:\\root\\archive\\b\.pdf/)).toBeTruthy();
  });

  it('低置信度条目标黄并显示「请确认」', () => {
    const { container } = render(
      <ArchivePreview entries={[entry({ lowConfidence: true })]} />,
    );
    expect(screen.getByText('请确认')).toBeTruthy();
    expect(container.querySelector('.low-confidence')).toBeTruthy();
  });

  it('无 dry-run 预览时执行按钮禁用', () => {
    render(<ArchivePreview entries={[]} batchId={null} />);
    const btn = screen.getByRole('button', { name: /执行归档/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('整批拒绝时提示原因且执行按钮禁用', () => {
    render(
      <ArchivePreview
        batchId="b1"
        entries={[entry({ blocked: true, reason: '跨盘符操作被拒绝' })]}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('跨盘符操作被拒绝');
    const btn = screen.getByRole('button', { name: /执行归档/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('正常预览可执行，点击执行触发 onConfirm(batchId)', () => {
    const onConfirm = vi.fn();
    render(
      <ArchivePreview batchId="b1" entries={[entry()]} onConfirm={onConfirm} />,
    );
    const btn = screen.getByRole('button', { name: /执行归档/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledWith('b1');
  });
});
