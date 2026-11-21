import { themeCss } from './index';
import type { ThemePack } from './types';

/**
 * Applies a theme's colours to the page. The root layout renders the
 * site theme; a party's layout renders its own after it, which wins.
 */
export default function ThemeStyle({ pack }: { pack: ThemePack }) {
  return (
    <>
      <style data-theme={pack.key} dangerouslySetInnerHTML={{ __html: themeCss(pack) }} />
      {pack.skin?.fonts ? <link rel="stylesheet" href={pack.skin.fonts} /> : null}
      {pack.skin ? <link rel="stylesheet" href={pack.skin.href} media="screen" /> : null}
    </>
  );
}
