import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LeParty',
  description: 'Signup and intake for themed parties.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
