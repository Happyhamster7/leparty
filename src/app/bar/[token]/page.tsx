import { notFound } from 'next/navigation';
import { eventForScreen } from '@/lib/screens';
import { themePack } from '@/themes';
import ThemeStyle from '@/themes/ThemeStyle';
import AutoRefresh from '@/components/AutoRefresh';

export const dynamic = 'force-dynamic';

/**
 * The bar's tablet. It has nothing to pour until a game with a bar
 * queue is running, at which point that game fills this page. It exists
 * now so the bar has its own link from the start, never the host's
 * passcode.
 */
export default async function BarPage({ params }: { params: { token: string } }) {
  const ev = await eventForScreen('bar', params.token);
  if (!ev) notFound();

  const pack = themePack(ev.theme_key);

  return (
    <>
      <ThemeStyle pack={pack} />
      <AutoRefresh seconds={5} />
      <div className="shell">
        <div className="topbar">
          <span>{(ev.theme_title || ev.name).toUpperCase()}</span>
          <span>BAR</span>
        </div>
        <div className="body">
          <h1>Nothing to pour</h1>
          <p className="lede">
            Orders show up here when a game with a bar is running. Leave this page open.
          </p>
        </div>
      </div>
    </>
  );
}
