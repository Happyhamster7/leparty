import { notFound } from 'next/navigation';
import Link from 'next/link';
import { loadInvite } from '@/lib/invite';
import { getTheme } from '@/lib/theme';
import { db, MUGSHOT_BUCKET } from '@/lib/supabase';
import { initials, POTLUCK_CATEGORIES } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function BookedPage({ params }: { params: { token: string } }) {
  const ctx = await loadInvite(params.token);
  if (!ctx) notFound();

  const { person, participant, event } = ctx;
  const theme = getTheme(event.theme_key);
  const token = params.token;

  let photoUrl: string | null = null;
  if (participant.photo_path) {
    const { data } = await db()
      .storage.from(MUGSHOT_BUCKET)
      .createSignedUrl(participant.photo_path, 60 * 30);
    photoUrl = data?.signedUrl ?? null;
  }

  const categoryLabel =
    POTLUCK_CATEGORIES.find((c) => c.key === participant.potluck_category)?.label ?? null;

  return (
    <div className="shell">
      <div className="topbar">
        <span>{theme.intakeLabel.toUpperCase()} COMPLETE</span>
        <span>FILE {participant.inmate_number ?? '----'}</span>
      </div>

      <div className="body">
        <div className="stamp">{theme.bookedLabel}</div>

        <div
          className="box"
          style={{ display: 'flex', gap: 14, background: 'var(--card)', alignItems: 'center' }}
        >
          <div
            style={{
              width: 78,
              height: 96,
              background: '#d8d2c4',
              border: '1px solid #b9b2a2',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span
                style={{
                  fontFamily: 'var(--display)',
                  fontSize: 26,
                  color: 'var(--muted-2)',
                }}
              >
                {initials(person.display_name)}
              </span>
            )}
          </div>

          <div style={{ minWidth: 0 }}>
            <p
              style={{
                margin: '0 0 4px',
                fontFamily: 'var(--display)',
                fontWeight: 600,
                fontSize: 21,
                textTransform: 'uppercase',
                lineHeight: 1.1,
              }}
            >
              {person.display_name}
            </p>
            <p className="mono" style={{ margin: '0 0 9px', fontSize: 11 }}>
              {theme.attendeeIdLabel.toUpperCase()} {participant.inmate_number ?? '----'}
            </p>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)' }}>
              Charge and cell block assigned on the night.
            </p>
          </div>
        </div>

        <p className="eyebrow">What happens next</p>

        <ol style={{ margin: '0 0 24px', padding: 0, listStyle: 'none' }}>
          {[
            participant.potluck_item
              ? `Turn up in costume. Bring the ${participant.potluck_item.toLowerCase()}.`
              : 'Turn up in costume.',
            'Tap your own face on the check-in screen at the door.',
            `${theme.groupNounPlural} are drawn once everyone’s arrived. Your ${theme.groupNoun.toLowerCase()} gets one card with a code on it.`,
          ].map((line, i) => (
            <li key={i} style={{ display: 'flex', gap: 12, marginBottom: 13 }}>
              <span
                className="mono"
                style={{ color: 'var(--rust)', flexShrink: 0, fontSize: 12 }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <span style={{ fontSize: 14, lineHeight: 1.45 }}>{line}</span>
            </li>
          ))}
        </ol>

        {event.dress_code ? (
          <div className="box box--quiet">
            <p className="eyebrow eyebrow--quiet">Don&rsquo;t forget</p>
            <p style={{ margin: 0, fontSize: 14 }}>
              {event.dress_code}
              {event.dress_code_notes ? ` ${event.dress_code_notes}` : ''}
            </p>
          </div>
        ) : null}

        <div className="btn-row">
          <Link className="btn" href={`/i/${token}/going`} prefetch={false}>
            Complete
          </Link>
        </div>

        <div className="btn-row" style={{ marginTop: 10 }}>
          <Link className="btn btn--ghost" style={{ flex: 1 }} href={`/i/${token}/mugshot`}>
            Retake mugshot
          </Link>
          <Link className="btn btn--ghost" style={{ flex: 1 }} href={`/i/${token}/potluck`}>
            Change what I&rsquo;m bringing
          </Link>
        </div>

        <p className="small" style={{ marginTop: 14, textAlign: 'center' }}>
          {categoryLabel ? `Filed under ${categoryLabel.toLowerCase()}. ` : ''}
          This link stays live until the night.
        </p>
      </div>
    </div>
  );
}
