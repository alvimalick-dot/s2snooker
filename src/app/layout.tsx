import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'The Break Snooker Club — Table Management',
  description: 'Live table status, menu, and revenue dashboard for a snooker club.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans bg-surface text-ink antialiased">{children}</body>
    </html>
  );
}
