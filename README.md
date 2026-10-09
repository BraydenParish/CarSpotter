# CarSpotter

A car-identification game built on **real photographs**. A photo appears, you name the car, you see the answer with a spotting tip, and you go again. Built with React 19, TypeScript, Vite and Tailwind CSS 4. No backend: everything runs in the browser and progress is stored in `localStorage`.

## Current status

**75 verified photographs of 28 distinct cars**, all from Wikimedia Commons under CC0, public domain, CC BY or CC BY-SA, each viewed at full size before approval. Every mode is playable.

| | Target | Actual |
| --- | --- | --- |
| Verified photographs (approved, full) | ≥ 30 | **75** |
| Distinct cars | ≥ 20 | **28** (of 30 vehicle records) |
| Street photos | favoured | **34 street**, 41 other (car shows, museums, rallies, dealer forecourts), 0 studio |
| Expert-eligible photos | — | **58** photos of 21 cars (15 ask for a model year, the rest for the generation) |
| Detail-challenge crops | ≥ 3 cars to unlock | **5** headlight crops (MX-5, Supra, Jimny, Model 3, Golf), so Detail mode is unlocked |

How the set was built: 105 candidates were picked from Commons contact sheets, and each was checked against its Commons file page (license, category, description). Every imported photo was then viewed at full size, with zoomed crops of badges and scripts. **29 candidates were rejected**, almost all because a legible model name (a grille script, fender badge, boot lettering, decal or show placard) would give the answer away. They stay in `data/candidates.json` with the reason, but they are never imported or shipped. One approved candidate (`honda-nsx-na-02`) could not be downloaded: Wikimedia returned HTTP 429 for that file throughout the session. Re-running `npm run import-photos` will pick it up.

Photos per car: MX-5, Skyline R34 and Supra have 5 each; 240Z, Fiat 500 and Golf have 4; most others have 2–3. **Camaro, Challenger, E-Type and Land Cruiser have 1 each**, because nearly every Commons photo of them shows the model script. **Dodge Charger and Ford F-150 have no approved photo**: every candidate has "Charger" in the grille or "F150" on the fender, so both records stay unused until clean photos are found.

Themes on offer (each needs ≥ 4 cars): Everyday (10), Classics (15), JDM (7), Supercars (5), European (15) and Off-Road (4: Defender, Wrangler, Land Cruiser J40, Jimny). **Muscle is hidden**: only 3 muscle cars have usable photos (Mustang, Camaro, Challenger). The game reports this rather than padding the theme.

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

`src/data/types.ts` (schema), `src/data/vehicles.json` (**30 vehicle records**: make, model, aliases, generation, body style, country, years, categories, verified tip, reference URL) and `src/data/photos.json` (80 approved records: 75 photos plus 5 detail crops). A photo record holds: id, vehicle id, image paths, street/studio/other, visible angle, verified model-year range with written basis, optional trim, identity evidence URLs, source page, photographer, license name + URL, credit line, modification notice, review status, and **which answer fields it fairly supports** (make, model, year, generation, trim). Vehicle records and photo records are separate.

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

4. **Import**: `NODE_USE_ENV_PROXY=1 npm run import-photos` (`-- --dry-run` checks licensing only, `-- --only <id>` imports one, `-- --force` re-downloads). It fetches license metadata, **rejects disallowed licenses**, downloads a 1920 px rendition (or the original if smaller), optimises it into `public/photos/`, and writes `src/data/photos.json`. Candidates marked `rejected` in review are removed from the manifest and `public/` on every run. A download that hits a Wikimedia rate limit is skipped and reported; run the command again to retry. Crop rectangles are in original-file pixels and are scaled to the downloaded rendition.
5. **Validate**: `npm run validate` checks schema, ids, license allow-list, attribution fields, year-evidence rules, file existence, crop provenance and prints coverage vs. the 30-photo/20-car targets. `npm run build` runs it first.

## Accessibility and reliability

Dark theme with high-contrast text, 44 px+ touch targets (48 px on primary buttons), visible focus rings, a skip link, keyboard play (1–4, Enter, →), modal dialogs, live regions for results, `role="timer"`, reduced-motion support (system or manual), 16 px inputs (no iOS zoom) and a dynamic-viewport layout so the typing form stays usable when the mobile keyboard opens. Quiz images use neutral alt text ("A car to identify") until the reveal. The next photo is preloaded; a photo that fails to load (or loads too slowly) is swapped without scoring anything; double submissions are ignored; small filtered pools shorten sessions; empty Expert pools are reported before starting.

## Testing

- **Automated (76 tests, `npm test`)**: answer matching, aliases, typo guards (now including regressions found by probing real answers: `260Z`/`280Z` are not a 240Z, `Prius c`/`Prius v` are not an XW30 Prius, `300 SLR` is not a 300 SL; `Golf 7`, `993` and `NSX-R` are accepted), combined entry, Expert eligibility/requirements, distractor validity (exactly one correct option, no two options naming the same model under different badges, vans offered for vans), scoring and bests, repeat prevention, deterministic daily selection, the run engine for every mode, progress/garage/practice, achievements, spoiler-free sharing, license rules and UI smoke tests.
- **Answer-checker probe**: 154 real-world inputs across all 28 cars (right names, common misspellings, nicknames and *different real models*). All 154 behave correctly.
- **Playtested with the real photos** in Chromium (Playwright driving `npm run dev`), at 390×780 (phone) and 1280×800 (desktop):
  - Played: 10-Round Session (Normal/Hard/Expert), Free Play (Normal/Expert), Time Attack (Normal/Hard), Survival (Normal/Expert), Daily (Normal/Hard/Expert), Themed (Everyday, JDM, Off-Road on Normal/Hard/Expert), Detail (Normal/Hard) and Practice (Normal/Hard).
  - Inputs: correct, wrong and partial answers.
  - What was checked: no page errors; each Normal round had exactly one correct option; Expert showed its year or generation requirement before submission and accepted any year in the documented range; the reveal, credits and results screens rendered correctly.
- **Fixed during playtesting**:
  - Acura Integra and Honda Integra could both appear as distractors.
  - The VW T1 was offered sports-car distractors (the lexicon had no other vans).
  - The reveal screen's "Press Enter" hint overlapped the photo-credit link on phones.
  - Rejected photos were still being shipped in `public/`.
  - Detail crops broke once the importer switched to 1920 px renditions; crop rectangles are now scaled.

## Known limitations

- **Coverage is uneven**: 4 cars have a single photo and 2 vehicle records (Charger, F-150) have none, because their badges are part of the design. The Muscle theme stays hidden until a fourth muscle car has clean photos.
- **More show photos than street photos** (41 vs 34). On Commons, classics and supercars are mostly photographed at shows.
- Expert asks for the generation on most photos. Only 15 photos can prove a year range, and only one (a 1969 Camaro) proves an exact year.
- Tips and year ranges were re-checked against each vehicle's reference article. Fixes made:
  - Citroën DS: glass-covered headlamps arrived in late 1967, for the 1968 model year.
  - Citroën 2CV: the bonnet ribbing changed in 1960.
  - Tesla Model 3: the chrome trim was dropped in November 2020.
  - Datsun 240Z: the export name changed to 260Z in 1974, so the record now covers 1969–1973.
  - Porsche 993: the tip is now worded as the reference describes it.
  - Lamborghini Aventador: the 2017 Aventador S front.
  - Two references (Ferrari F40, Fiat 500) could not be re-fetched because of Wikipedia rate limits, so those tips are unchanged.
- Sound effects are synthesized beeps (Web Audio); there are no recorded sounds.
- Progress is per-browser; the daily "one attempt" rule is honour-system (no server).
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
