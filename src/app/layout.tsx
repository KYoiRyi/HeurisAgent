import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '启发式学业智能体',
  description: 'HeurisAgent',
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
