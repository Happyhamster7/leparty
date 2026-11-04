'use client';

import { useRouter } from 'next/navigation';
import { SKINS, SKIN_COOKIE, SKIN_LABELS, type Skin } from '@/lib/skin';

/**
 * Small floating picker for trying skins on the real pages. Only
 * rendered once someone has opted in with a ?skin= link, so guests on
 * the default never see it. Choosing "Original" clears the cookie and
 * hides the picker again.
 */
export default function SkinSwitcher({ current }: { current: Skin }) {
  const router = useRouter();

  function choose(skin: Skin) {
    if (skin === 'default') {
      document.cookie = `${SKIN_COOKIE}=; path=/; max-age=0; samesite=lax`;
    } else {
      document.cookie = `${SKIN_COOKIE}=${skin}; path=/; max-age=${60 * 60 * 24 * 90}; samesite=lax`;
    }
    router.refresh();
  }

  return (
    <div className="skin-switcher no-print" role="group" aria-label="Skin">
      {SKINS.map((skin) => (
        <button
          key={skin}
          type="button"
          aria-pressed={skin === current}
          onClick={() => choose(skin)}
        >
          {SKIN_LABELS[skin]}
        </button>
      ))}
    </div>
  );
}
