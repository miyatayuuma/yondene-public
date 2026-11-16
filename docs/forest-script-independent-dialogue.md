# Script-independent forest dialogue (v15)

## Runtime contract

Ordinary NPCs need a registry record (`mode: 'ai'`), a validated Drive sprite,
reviewed private character/speech rows and an available generator. They do not
need meet, ambient, story or reflection cues. Real personas, book IDs, family
records, quotes, source rows and private spreadsheet/image IDs stay outside Git.

- `book-forest-private-dialogue.mjs` loads empty cue collections. The owner cache
  also accepts empty cues and twin material without discarding ordinary profiles.
- `createForestDialogueDirector.start({generation:true})` selects a scene from
  current books, sourced memories, encounter state and registry relationships.
  First meeting takes priority; a pending relay survives until a later visit.
  Related unread memories never enter the candidate set. Shared seen-memory state
  and alternating character/forest interests spread topics across encounters.
- Live dialogue requests this scene, adds the private voice guide, scoped source
  facts and recent conversation, and generates the opening and replies. Optional
  approved lines are prompt examples or matching scene fallbacks. The normal
  generation path never needs a successful authored-cue lookup.
- Only ambient slots can take a fresh reader reflection. The existing shared
  spotlight scheduler remains the single selector: acknowledgement is recorded
  on display, with intervening non-reflection visits and per-book deduplication.
  Authored reflection cues cannot bypass this scheduler in generation mode.
- Attribution remains attached to reflection replies. Current read status is
  checked again before forwarding story/reflection continuations. Source IDs
  remain local and are stripped from prompts and reader-reaction diagnostic logs.
- Missing profiles fail closed to local dialogue. Missing images/personas/AI are
  reported by `diagnoseForestCharacters` using only public IDs and reason codes.
  No new authentication, Firestore writes or private GAS changes are involved.
- Cat stays silent and twins keep their independent authored two-speaker engine.
  Voice playback and forest rendering/movement/camera code are unchanged.

## Browser / Worker compatibility

`registryRevision` still detects an old NPC roster. A separate shared
`FOREST_DIALOGUE_PROTOCOL` now also detects an old request contract even if the
roster did not change. Worker v15 validates each constraint as a bounded string
while retaining the existing twelve-constraint cap. The mock integration exercises
opening, reply, source and closing combinations against this unchanged cap.
Health reports both revisions. Deploy the
Worker before Hosting; an old Worker produces an explicit fallback diagnostic.

The Worker bundle and voice-lab artifact are generated from the same registry.
Do not hand-edit a second allowlist. Offline authoring, thought-seed selection and
optional seed-counter sync also derive IDs from that registry.

## Verification

`book-forest-script-independent.test.mjs` creates an isolated module tree and
adds six fictional NPCs only to its registry. It runs the real director, provider,
Worker validation and reply decoder against a mock Workers AI binding. Production
registry records and real family data are never changed. Scenarios cover empty
cues, first meet/revisit, current-read facts/revocation, no memory, shared review
usage/attribution, relay, displayed generated opening/reply, outage, quota,
missing-persona/image diagnostics and roster/protocol mismatch. Existing cat,
twins, voice, rendering, domain, PWA, privacy and security-rule suites still run.

Run the static checks and tests specified in `.github/workflows/public-pwa-checks.yml`.
The Firestore Rules suite needs its local emulator, not production access:

```sh
cd reading-shelf-firebase
npm install --no-audit --no-fund
npx firebase emulators:exec --only firestore --project demo-reading-shelf-rules "node --test firestore.rules.test.mjs"
```

Run `python scripts/forest-dialogue-browser-check.py` for actual WebGL/UI opening,
reply, ending, revisit and outage checks using synthetic assets and output.

No live Gemma call is part of implementation acceptance. Personality and natural
language quality require a separate, small owner-authenticated acceptance run.

## Deployment from the merged main

Use an existing authenticated checkout. Stop if `git pull --ff-only` fails; do not
reset local changes. These commands deploy only Worker code and Hosting, never
Firestore data or Rules. Existing Worker owner configuration must be retained;
no secret creation or replacement is required.

```sh
git switch main
git pull --ff-only
cd cloudflare/forest-ai
npx --yes wrangler@4 deploy --dry-run --outdir /tmp/forest-worker-bundle
npx --yes wrangler@4 deploy
cd ../../reading-shelf-firebase
npx firebase deploy --only hosting --project kodomo-reading-shelf-87f11
```

Verify `/health` reports `forest-dialogue-v15`, the current registry revision and
`scene-dialogue-v15`, while Hosting reports build `20261116-forest-scenes-v15`.
Reopen the app before testing. Existing roster-based private-cache invalidation
is preserved; empty-cue caches now work without repeated downloads. An actual
new NPC still needs its private reviewed profile and sprite before owner acceptance.
