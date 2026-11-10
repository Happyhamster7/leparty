import { loadInvite } from '@/lib/invite';
import { themePack } from '@/themes';
import ThemeStyle from '@/themes/ThemeStyle';

/** Every invite page wears its party's theme. */
export default async function InviteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { token: string };
}) {
  const ctx = await loadInvite(params.token);
  return (
    <>
      {ctx ? <ThemeStyle pack={themePack(ctx.event.theme_key)} /> : null}
      {children}
    </>
  );
}
