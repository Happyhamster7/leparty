import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import './skins/rpg.css';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/600.css';
import '@fontsource/pixelify-sans/700.css';
import '@fontsource/jersey-10/400.css';
import './skins/pixel.css';
import '@/components/pixel/sprites.css';
import '@/components/pixel/kit.css';
import { SKIN_COOKIE, SKIN_FONTS, parseSkin } from '@/lib/skin';
import SkinSwitcher from '@/components/SkinSwitcher';

export const metadata: Metadata = {
  title: 'LeParty',
  description: 'Signup and intake for themed parties.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const skinCookie = cookies().get(SKIN_COOKIE)?.value;
  const skin = parseSkin(skinCookie);
  const fonts = SKIN_FONTS[skin];

  return (
    <html lang="en" data-skin={skin === 'default' ? undefined : skin}>
      <head>
        {fonts ? (
          <>
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
            {/* eslint-disable-next-line @next/next/no-page-custom-font */}
            <link rel="stylesheet" href={fonts} />
          </>
        ) : null}
      </head>
      <body>
        {children}
        {skinCookie ? <SkinSwitcher current={skin} /> : null}
      </body>
    </html>
  );
}
