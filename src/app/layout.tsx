import type { Metadata } from 'next';
import { sitePack } from '@/themes';
import ThemeStyle from '@/themes/ThemeStyle';
import './globals.css';

export const metadata: Metadata = {
  title: 'LeParty',
  description: 'Run themed parties: signup, check-in, teams and games.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeStyle pack={sitePack()} />
        {children}
      </body>
    </html>
  );
}
