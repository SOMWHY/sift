import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sift',
  description: '本地优先的文件整理系统',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <meta
          httpEquiv="Content-Security-Policy"
          content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
