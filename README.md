# CarSpotter

A car-identification game built on **real photographs**. A photo appears, you name the car, you see the answer with a spotting tip, and you go again. Built with React 19, TypeScript, Vite and Tailwind CSS 4. No backend: everything runs in the browser and progress is stored in `localStorage`.

## Current status

**126 verified photographs of 39 distinct cars**, plus **14 badge-free detail crops**. Every photo comes from Wikimedia Commons under CC0, public domain, CC BY or CC BY-SA, and each was viewed at full size before approval. Every mode is playable. The game can be installed and played offline.

| | Target | Actual |
| --- | --- | --- |
| Verified photographs (approved, full) | ≥ 30 | **126** |
| Distinct cars | ≥ 20 | **39** (of 41 vehicle records) |
| Setting | street favoured (later relaxed) | **55 street**, 71 other (car shows, museums, rallies, dealer forecourts), 0 studio |
| Expert-eligible photos | — | **80** photos of 26 cars (16 ask for a model year, the rest for the generation) |
| Detail-challenge crops | ≥ 3 cars to unlock | **14** (MX-5, Supra, Jimny, Model 3, Golf Mk7, Miura, Testarossa, DS, Beetle, 2CV, Golf Mk1, Countach, W123, Trabant) |

**How the set was built**
- 159 candidates were picked from Commons contact sheets.
- Each was checked against its Commons file page: license, category and description.
- Every imported photo was then viewed at full size, with zoomed crops around badges, scripts and plates.
- **33 candidates were rejected**. Almost all showed a legible model name: grille script, fender badge, boot lettering, a decal, a show placard, or a number plate reading "…ROSSA". One was rejected because a different car in the game stood prominently beside it.
- Rejected candidates stay in `data/candidates.json` with the reason, but they are never imported or shipped. None are pending.

**Photos per car**
- 5–6 each: W123, Barracuda, Miura, Series III, RX-7, MX-5, Skyline, Renault 4, Supra.
- 2–4 each: most others.
- 1 each: Camaro, Challenger, E-Type and Land Cruiser J40. Nearly every Commons photo of these shows the model script.
- None: Dodge Charger and Ford F-150. Every candidate showed "Charger" in the grille or "F150" on the fender, so both records stay unused.

**Themes** (each needs at least 4 cars): Everyday (13), Classics (24), JDM (8), Muscle (4: Mustang, Camaro, Challenger, Barracuda), Supercars (7), European (23) and Off-Road (6). All seven are available.

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
| **Focus** | Ten cars. Each photo starts heavily blurred and sharpens over 12 s; points fall from 100% to 30% as it comes into focus (a live meter shows the current value). Enlarging the photo is disabled until the reveal. Normal and Hard. |
| **Party (pass & play)** | 2–4 named players share one device. Each gets five different cars, with a "pass the phone" screen that hides the next photo and answers until that player taps *I'm ready*. Streaks are per player. Ends with a scoreboard (ties share a place) and a rematch button. Party games never change the owner's stats, garage, achievements or bests. |
| **Practice** | Only cars you missed. Two correct practice answers clear a car. Does not affect bests or main stats. |

**Learning from mistakes.** Each car's record is tracked. When a wrong answer names another real car (the option picked on Normal, or a typed make and model that exactly matches a known car), the mix-up is recorded too. Stats shows *Toughest cars* and *Cars you mix up*; the garage shows your record and past mix-ups for each car. The reveal shows the spotting tip of the car you picked, when it is in the collection, next to the right car's tip.

**Offline and installable.** The game has a web-app manifest, icons and a service worker:
- Pages are network-first. Hashed assets and photos are cache-first.
- Chromium browsers get an **Install app** button.
- Settings → *Offline play* saves every verified photo for offline use (about 35 MB), with progress, stop and remove.
- The service worker is registered only in production builds.

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

`src/data/types.ts` (schema), `src/data/vehicles.json` (**41 vehicle records**: make, model, aliases, generation, body style, country, years, categories, verified tip, reference URL) and `src/data/photos.json` (140 approved records: 126 photos plus 14 detail crops). A photo record holds: id, vehicle id, image paths, street/studio/other, visible angle, verified model-year range with written basis, optional trim, identity evidence URLs, source page, photographer, license name + URL, credit line, modification notice, review status, and **which answer fields it fairly supports** (make, model, year, generation, trim). Vehicle records and photo records are separate.

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

- **Automated (87 tests, `npm test`).** Covers:
  - Answer matching, aliases, the typo guard and combined make/model entry.
  - Every documented generation name and alias for every car (see the generation bug below).
  - Expert eligibility and requirements.
  - Distractor validity: exactly one correct option, no model offered twice under different badges, vans offered for vans.
  - Scoring and bests, the Focus multiplier, repeat prevention and deterministic daily selection.
  - The run engine for every mode, including Party turn order, per-player streaks, standings and ties.
  - Progress, garage and practice; mix-up and per-car tracking (and loading profiles saved before it existed).
  - Party games never touching the owner's profile.
  - Achievements, spoiler-free sharing, license rules and UI smoke tests.
- **Answer-checker probes.** 154 + 81 real-world inputs across all 39 cars: right names, misspellings, nicknames and *different real models* (`RX-8` is not an RX-7, `GL-Class` not a G-Class, `512 TR` not a Testarossa, `912` not a 356, `W124` not a W123, `Challenger` not a Barracuda, `Series II` not a Series III). Plus 30 generation inputs. All behave correctly.
- **Playtested with the real photos** in Chromium (Playwright driving `npm run dev`) at 390×780 (phone) and 1280×800 (desktop). Modes played:
  - 10-Round Session (Normal/Hard/Expert), Focus (Normal/Hard), Free Play (Normal/Hard/Expert), Time Attack (Normal/Hard), Survival (Normal/Hard/Expert).
  - Daily (Normal/Hard/Expert).
  - Themed: Everyday, JDM, Muscle, Off-Road and Supercars across Normal, Hard and Expert.
  - Detail (Normal/Hard), Practice (Normal/Hard/Expert), and Party with three players.
  - Answers were a mix of correct, wrong and partial.
- **What the playtest checked.** No page errors. Exactly one correct option per Normal round. Expert states its year or generation requirement before you submit. The Party hand-off screen hides the photo and the answers. The Focus blur and meter work, and the enlarge button is hidden until the reveal. The reveal, credits and results screens render correctly.
- **Bugs found by playtesting and fixed:**
  - **Generation answers containing the model name were rejected.** The Fiat 500's own generation, "Nuova 500", was marked wrong, along with 10 other documented aliases such as "Golf I", "Sting Ray" and "40 series". The checker removed model words from the typed text but not from the accepted names.
  - Two distractors could be the same car under different badges (Acura/Honda Integra).
  - The VW T1 was offered sports cars as distractors.
  - On phones, the reveal footer overlapped the credit link.
  - Rejected photos were still being shipped.
  - Detail crops broke after the switch to 1920 px downloads.
- **Not fixed.** One dev-server playtest run jumped back to the home screen. This matches a Vite page reload, which happens when `photos.json` is rewritten during an import, and four reruns did not reproduce it. A production build has no hot reload, but an in-progress run is still not saved if the browser reloads the tab (see limitations).

## Known limitations

- **Uneven coverage.** Four cars have a single photo, and two vehicle records (Dodge Charger, Ford F-150) have none, because their model names are part of the bodywork.
- **More show photos than street photos** (71 vs 55). Commons mostly has show photos of classics and supercars.
- **Expert usually asks for the generation.** Only 16 photos can prove a year range, and one (a 1969 Camaro) proves an exact year.
- **Small Expert pools for some themes.** For example, Supercars on Expert has 3 cars, so those runs are short. The game shortens the run rather than repeating cars.
- **An in-progress run is lost if the tab reloads.** For example, a phone browser can discard a background tab. Stats from the rounds already answered are kept.
- **Fiat 500 tip not re-checked.** Every vehicle's tip and year range was checked against its reference article except the Fiat 500, whose article Wikipedia's API returned empty.
- **Offline save fills on demand.** Saving photos for offline fetches them on request, and the service worker only caches photos as they are viewed.
- **No server.** Sound effects are synthesized beeps; there are no recorded sounds. Progress is per browser. The daily "one attempt" and Party scores are on the honour system.
- **Hand-written lexicon.** The reference lexicon used for distractors and the typo guard is hand-written and incomplete.

## Future features (not implemented)

Server-validated daily results, online multiplayer (Party is local pass-and-play only), leaderboards, resuming a run after a reload, community photo uploads/review queue, richer detail-challenge tooling, and recorded audio.

## Project layout

```
src/game/      pure game logic (matching, distractors, expert, scoring, deck, pool, engine, progress, achievements, share)
src/data/      types, vehicles.json, photos.json, lexicon, dataset loader
src/ui/        React screens and components
src/dev/       test fixtures (never in production)
scripts/       import-photos, validate-data, explore-category, shared Commons client
data/          candidates.json (reviewed photos awaiting import)
```
