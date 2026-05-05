import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'EduAgentX | 多智能体启发式学习平台',
    template: '%s | EduAgentX',
  },
  description: '基于多智能体协作的启发式学习智能体平台，支持课堂互动、错题管理、复习策略等学习场景',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased min-h-screen bg-background">
        {children}
      </body>
    </html>
  );
}
