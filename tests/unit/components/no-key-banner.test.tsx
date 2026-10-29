// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NoKeyBanner } from '../../../src/components/NoKeyBanner';

describe('NoKeyBanner (Task 3.4)', () => {
  it('未配置时显示提示条', () => {
    render(<NoKeyBanner configured={false} />);
    expect(screen.getByText(/未配置 AI/)).toBeTruthy();
    expect(screen.getByText('点击配置。')).toBeTruthy();
  });

  it('配置后提示条消失', () => {
    const { container } = render(<NoKeyBanner configured={true} />);
    expect(container.firstChild).toBeNull();
  });

  it('点击关闭后提示条消失', () => {
    const { container } = render(<NoKeyBanner configured={false} />);
    fireEvent.click(screen.getByRole('button', { name: /关闭/ }));
    expect(container.firstChild).toBeNull();
  });
});
