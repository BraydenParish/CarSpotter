# CarSpotter

A car-identification game built on **real photographs**. A photo appears, you name the car, you see the answer with a spotting tip, and you go again. Built with React 19, TypeScript, Vite and Tailwind CSS 4. No backend: everything runs in the browser and progress is stored in `localStorage`.

## ⚠️ Current status: the photo collection is empty

**This build ships with 0 verified photographs and 0 playable cars.** The game, every mode, the answer checker, the import pipeline and the validators are finished and tested, but the curated photo manifest (`src/data/photos.json`) is still `[]`.

Why: the photo import needs Wikimedia Commons (`commons.wikimedia.org` for the MediaWiki API and `upload.wikimedia.org` for files). The sandbox this was built in blocked both hosts at its network egress proxy (HTTP 403 on CONNECT, recorded in the proxy log), so no photograph could be fetched, license-checked or visually verified. Nothing was substituted: there are no placeholder images, no AI-generated cars, no guessed URLs and no unverified labels in the production build.

What a player sees today: a clear "photo collection is being verified" screen instead of a quiz. Once photos are imported (below) every mode lights up automatically, and modes that need more data stay locked with the reason shown.

| Target from the brief | Actual |
| --- | --- |
| ≥ 30 verified photographs | **0** |
| ≥ 20 distinct cars | **0** (28 vehicle records are defined and ready, with tips and aliases, awaiting photos) |
| Street photos favoured | n/a |

**To finish the collection**, run the import in an environment that can reach Wikimedia (see [Adding verified photos](#adding-verified-photos)). `npm run validate` prints the live shortfall against the targets.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm run check      # validate data + typecheck + tests
npm run build      # validate + typecheck + production build into dist/
npm run preview
```

Requires Node 20+.

### Development fixtures (never shipped)

`http://localhost:5173/?fixtures` (dev server only) loads 30 synthetic *placeholder cards* labelled "TEST FIXTURE … not a photograph" so every mode can be exercised before real photos exist. Fixtures use a separate `localStorage` key, show a warning banner, and are compiled out of production builds (`import.meta.env.DEV`). They are also what the unit tests use. They are not quiz photographs.

## Modes

| Mode | Rules |
| --- | --- |
| **10-Round Session** | Ten different cars, one score, bests saved per difficulty. |
| **Free Play** | Endless, no clock. Cars don't repeat until every car in your filters has been shown. |
| **Time Attack** | 60 s start; correct +3 s, wrong/skip −3 s; speed bonus up to +50% for answers within 3 s. The clock pauses while a photo loads and during the reveal. Normal and Hard only. |
| **Survival** | 3 lives. Wrong or skip costs one; every 5 correct in a row restores one (max 3). |
| **Daily Challenge** | 5 cars, identical for everyone on a UTC date (deterministic seeded selection). **Resets at 00:00 UTC.** One scored attempt per difficulty per day; leaving early counts as your attempt. Spoiler-free share text. |
| **Themed Challenge** | Everyday, Classics, JDM, Muscle, Supercars, European, Off-road: offered only when ≥ 4 verified cars carry that dataset tag. |
| **Detail Challenge** | Close-up crops (headlight, taillight, interior, grille…) cut from licensed photos; unlocked only when ≥ 3 cars have verified crops. Crops never include badges by selection rule. |
| **Practice** | Only cars you missed. Two correct practice answers clear a car. Does not affect bests or main stats. |

Also: garage (cars you identified), 25 achievements (each hidden until the photo set can actually support it), XP/levels, stats, personal bests, daily streak, first-play intro, settings (sound, haptics, hints, auto-advance, motion), progress export/import/reset.

## Difficulty and answer rules

- **Normal**: four choices (make + model). Distractors are real cars (dataset vehicles plus a reference lexicon) of the same body style/era/category where possible. Exactly one option is correct: other names for the same car (aliases, badge-engineered twins) are excluded, and positions are shuffled.
- **Hard**: type make and model.
- **Expert**: make, model and **one precision field chosen per photo**. The requirement is shown *before* you submit:
  - an **exact model year** only when the photo's verified evidence pins a single year;
  - otherwise **any year in the documented visually-equivalent range** (≤ 12 years) is accepted;
  - otherwise the **generation** is asked instead;
  - photos that support none of these are excluded from Expert, and an empty Expert pool is reported rather than started. Trim is never required.

**Answer checking** (`src/game/matching.ts`): case, spacing, punctuation and accents are ignored (`MX-5` = `mx5` = `MX 5`; `Citroën` = `Citroen`); explicit aliases are accepted (`VW`, `Chevy`, `Miata`, `Gullwing`); trims and years around the model are tolerated (`Skyline GT-R`, `1969 Charger R/T`). Typos are forgiven **conservatively**: only within a length-based allowance, only with identical digits, and **never** if the text is — or is as close to — a different real make or model (`MX-6`, `912`, `Challenger` for a Charger, `Model S` for a Model 3 are all wrong). Typed `VW Golf` in one box is split correctly. Expert shows per-field feedback even when the whole answer is wrong. There is no autocomplete, so the UI never reveals candidate answers.

## Scoring

- Base points: **Normal 100 · Hard 200 · Expert 300**.
- Hints (country → decade → make) cut the points available to **75% → 50% → 25%**. Hinted runs keep **separate personal bests**.
- Partial credit (Hard/Expert only): Hard make 40% / model 60%; Expert make 25% / model 35% / year-or-generation 40%. Only a fully correct answer counts as correct and extends the streak.
- Streak bonus: +10% per consecutive correct answer after the first, capped at +50%.
- Time Attack speed bonus: +50% at ≤ 3 s fading to 0 at 10 s (fully correct answers only).
- Skip reveals the answer, scores 0 and ends the streak.
- Personal bests are keyed by **mode (and theme), difficulty, hints used, and whether filters were applied**, so differently assisted or filtered runs never compete. Leaving a run early sets no best. Practice never affects bests or stats.

## Photos, licensing and data

### Image-source requirements

- Source: **Wikimedia Commons** only, fetched through the MediaWiki API (`prop=imageinfo`, `iiprop=url|size|mime|extmetadata`, see <https://www.mediawiki.org/wiki/API:Imageinfo>), never scraped from Google Images, dealer sites, social media or manufacturer press galleries. No AI-generated cars.
- Licenses allowed (`scripts/lib/rules.ts`): CC0, public domain, CC BY, CC BY-SA. **Rejected automatically**: any NC, ND, "fair use", "all rights reserved" or unknown license.
- Studio/press-style photos are included only when their license is confirmed on the Commons file page.
- Attribution is preserved and **displayed**: author, license (linked), source page and a modification notice appear on the reveal ("Sources & photo credit"), in the Garage, and on the full **Photo credits** page. While a question is open the credit shows author and license; the file title (which often names the car) appears at the reveal. Required attribution is never removed.
- Images are resized (1600 px / 640 px WebP, metadata stripped). Crops are labelled as modifications.
- **A photo's capture or upload date is never evidence of the car's model year.** The validator rejects year evidence that cites one. Uncertain entries stay `pending` and are excluded from scored gameplay; only `review.status === "approved"` records are ever loaded.

### Data model

`src/data/types.ts` (schema), `src/data/vehicles.json` (**28 vehicle records**: make, model, aliases, generation, body style, country, years, categories, verified tip, reference URL) and `src/data/photos.json` (photo records, currently empty). A photo record holds: id, vehicle id, image paths, street/studio/other, visible angle, verified model-year range with written basis, optional trim, identity evidence URLs, source page, photographer, license name + URL, credit line, modification notice, review status, and **which answer fields it fairly supports** (make, model, year, generation, trim). Vehicle records and photo records are separate.

### Adding verified photos

1. **Find** candidates on Commons (categories by model/generation work well). `npx tsx scripts/explore-category.ts "Category:Mazda MX-5 (NA)" tmp-explore` builds a numbered contact sheet.
2. **Verify by eye and by evidence.** Confirm the car's identity from the file page, its category and a second source. Decide the model-year range from *visible features* (document them in `modelYear.basis`), never from the capture date. Decide which fields the photo supports (`supports`). Leave `year` false when the visible details can't narrow the range.
3. **Add a candidate** to `data/candidates.json`:

   ```jsonc
   {
     "id": "mx5-na-street-01",                 // kebab-case, becomes the filename
     "file": "File:<exact Commons title>.jpg",
     "vehicleId": "mazda-mx5-na",              // must exist in vehicles.json (add it first if not)
     "setting": "street",                      // street | studio | other
     "angle": "front-quarter",
     "modelYear": { "from": 1989, "to": 1997, "basis": "Pop-up headlights and NA bumpers; no feature separates 1989–97" },
     "supports": { "make": true, "model": true, "year": true, "generation": true, "trim": false },
     "identityEvidence": ["https://commons.wikimedia.org/wiki/Category:..."],
     "review": { "status": "approved", "reviewedBy": "your-name", "date": "2026-10-03", "notes": "Identified from badge + category" },
     "crops": [  // optional detail challenge crops (original-pixel rectangles, no badges)
       { "id": "mx5-na-street-01-headlight", "part": "headlight",
         "crop": { "left": 0, "top": 0, "width": 800, "height": 500 },
         "review": { "status": "approved", "reviewedBy": "your-name", "date": "2026-10-03", "notes": "" } }
     ]
   }
   ```

4. **Import**: `NODE_USE_ENV_PROXY=1 npm run import-photos` (`-- --dry-run` checks licensing only, `-- --only <id>` imports one, `-- --force` re-downloads). It fetches license metadata, **rejects disallowed licenses**, downloads and optimises images into `public/photos/`, and writes `src/data/photos.json`.
5. **Validate**: `npm run validate` checks schema, ids, license allow-list, attribution fields, year-evidence rules, file existence, crop provenance and prints coverage vs. the 30-photo/20-car targets. `npm run build` runs it first.

## Accessibility and reliability

Dark theme with high-contrast text, 44 px+ touch targets (48 px on primary buttons), visible focus rings, a skip link, keyboard play (1–4, Enter, →), modal dialogs, live regions for results, `role="timer"`, reduced-motion support (system or manual), 16 px inputs (no iOS zoom) and a dynamic-viewport layout so the typing form stays usable when the mobile keyboard opens. Quiz images use neutral alt text ("A car to identify") until the reveal. The next photo is preloaded; a photo that fails to load (or loads too slowly) is swapped without scoring anything; double submissions are ignored; small filtered pools shorten sessions; empty Expert pools are reported before starting.

## Testing

- **Automated (73 tests, `npm test`)**: answer matching, aliases, typo guards, combined entry, Expert eligibility/requirements, distractor validity/plausibility/shuffling, scoring and bests, repeat prevention, deterministic daily selection, the run engine for every mode (Survival lives, Time Attack clock, failed photos, double submit), progress/garage/practice, achievements, spoiler-free sharing, license rules, and UI smoke tests.
- **Manual playtesting (Chromium, mobile 390×780 and desktop 1280×800, fixture mode only)**: all of Session, Free Play, Hard, Expert, Time Attack, Survival, Daily, Themed, Detail and Practice were played through in a browser with scripted answers, including wrong answers, skips, hints, a simulated image failure, double clicks, keyboard play, reload persistence, reduced motion and a short-viewport "keyboard open" layout. This validated flow and layout, **not** the quality of real photographs or answer fairness against real photos, which can't be assessed until real photos exist.

## Known limitations

- **No real photographs yet** (see top). Quality of Normal distractors, Expert year rules and daily variety on a real collection is unverified.
- Sound effects are synthesized beeps (Web Audio); there are no recorded sounds.
- Progress is per-browser; the daily "one attempt" rule is honour-system (no server).
- Vehicle tips and year-range facts were written from general knowledge with reference URLs; each should be re-confirmed against its reference when its photos are reviewed.
- The reference lexicon used for distractors and the typo guard is hand-written and incomplete.

## Future features (not implemented)

Server-validated daily results, multiplayer, leaderboards, community photo uploads/review queue, richer detail-challenge tooling, and recorded audio.

## Project layout

```
src/game/      pure game logic (matching, distractors, expert, scoring, deck, pool, engine, progress, achievements, share)
src/data/      types, vehicles.json, photos.json, lexicon, dataset loader
src/ui/        React screens and components
src/dev/       test fixtures (never in production)
scripts/       import-photos, validate-data, explore-category, shared Commons client
data/          candidates.json (reviewed photos awaiting import)
```
