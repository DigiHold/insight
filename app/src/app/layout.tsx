import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Plus_Jakarta_Sans, Bricolage_Grotesque, Caveat } from 'next/font/google';
import './globals.css';

const body = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const head = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-head', display: 'swap' });
// Handwritten face used only for the "by Nicolas Lecocq" signature under the logo.
const sign = Caveat({ subsets: ['latin'], weight: ['600'], variable: '--font-sign', display: 'swap' });

export const metadata: Metadata = {
  title: 'Insight',
  description: 'Private analytics',
  robots: { index: false, follow: false, nocache: true },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${head.variable} ${sign.variable}`}>
      <body className="min-h-[100dvh] antialiased">{children}</body>
    </html>
  );
}
