# End-to-end tests

Real browsers driving the real app against a real database. Each test
plays a pretend party from several seats at once: a host, team phones,
the bar's tablet and the TV, each in its own browser.

| File | What it plays |
| --- | --- |
| `core.spec.ts` | A guest signing up and joining; the door and the draw; the TV and bar links; claiming a block card; switching themes |
| `game.spec.ts` | A whole night of the game from every seat; the API's seat rules; double taps and bursts of writes |
| `extras.spec.ts` | The costume vote; shelf editing; the four phone games `game.spec.ts` doesn't play |
| `clips.spec.ts` | Filming while drinking, through to private storage and the TV |
| `phone.spec.ts` | Every screen at the narrowest phone width, in both themes |

## Where they run

**On every pull request**, in CI (`.github/workflows/ci.yml`, the
`e2e` job). CI starts a throwaway Supabase with the Supabase CLI,
applies every migration in `supabase/migrations` to it, and runs the
tests there. Nothing to set up, and it never touches the live project.

**On your own machine**, if you want to. You need Docker and the
[Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase start
```

```bash
npm run e2e:local
```

To run one file, or to watch the browsers:

```bash
npm run e2e:local -- e2e/game.spec.ts --headed
```

## They will not run against the live database

Every test creates parties and people. `helpers.ts` refuses to start
unless `NEXT_PUBLIC_SUPABASE_URL` is on this machine. Everything a test
creates is named `ZZTEST`, so a stray row is easy to spot.

`E2E_ALLOW_REMOTE=1` turns that refusal off. It exists for a
deliberate one-off against a hosted project, and whoever uses it cleans
up afterwards.

## Writing one

- Start from `makeParty` in `helpers.ts`: it creates a party through
  the app and fills its blocks with checked-in people.
- Each test makes its own party, so tests never share state and can
  run side by side.
- Wait for what the screen shows, never for time. A phone learns of a
  change on its next poll, up to two seconds later; `expect(...)`
  already waits for that.
- An action a second seat depends on must be seen to land first. A
  host pressing "start drinks" before a phone's purchase has been
  confirmed is a race in the test, not a bug in the app: use
  `sendDrinks`, which waits for the confirmation.
