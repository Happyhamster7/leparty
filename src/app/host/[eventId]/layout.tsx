import { db } from '@/lib/supabase';
import { themePack } from '@/themes';
import ThemeStyle from '@/themes/ThemeStyle';

/** Every host page for one party wears that party's theme. */
export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { eventId: string };
}) {
  const { data } = await db().from('events').select('theme_key').eq('id', params.eventId).maybeSingle();
  return (
    <>
      {data ? <ThemeStyle pack={themePack(data.theme_key)} /> : null}
      {children}
    </>
  );
}
