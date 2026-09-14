# RESTORE POINT — OSRS Herblore Top-8 Live Spreadsheet
_Last updated: 2026-09-13 (session 5 — Phase 1 per-dose revenue + Phase 2 unf-cost model BOTH done)_

## THE GOAL (original user request, session 2026-09-13T06-00-11)
A spreadsheet that always shows **only the top 8 most profitable herblore potions**,
with **live price updates every 5–10 minutes** from the Grand Exchange, so it always
shows what is most profitable right now and drops what is no longer profitable.
**Update this file at the end of every session.**

## STATUS: ✅ WORKING (as of 2026-09-13 ~15:10 UTC)
- `herblore_top8.xlsx` is generated and live-updating.
- **Localhost website is live: http://127.0.0.1:8042/**
  - `/` — dashboard: live Top 8, all 54 potions (filterable), all 166 GE prices
    (incl. (2)-dose versions), item icons on every row, working amulet/goggles
    toggles, auto-refresh 30 s, xlsx download button
  - `/api/state` — JSON state (potions w/ model params + prices, meta)
  - `/herblore_top8.xlsx` — current workbook download
  - `/api/health` — {ok, updating}
  - `/img/<file>` — item icons (web/img/; mapping in images.json;
    re-download with `node fetch_images.mjs`)
  - `server.mjs` ALSO runs the 5-min price-update cycle (replaces run_live.mjs —
    the old loop was killed; do NOT run both).
- **PUBLIC URL (Cloudflare quick tunnel, no account):**
  https://quotations-coastal-attractions-become.trycloudflare.com
  (served by `./cloudflared tunnel --url http://127.0.0.1:8042`.)
  ⚠️ The trycloudflare URL is EPHEMERAL — it changes every time cloudflared
  restarts. After any restart, get the new URL with:
  `grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" cloudflared.log | head -1`
- Live server: `node server.mjs 8042` (check with:
  `for p in /proc/[0-9]*/cmdline; do tr '\0' ' ' < $p | grep -q 'server.mjs' && echo $p; done`)
- **If the machine restarted / server is dead, restart it with (ONE command only —
  do not chain other commands before it with &&/; or the launch gets killed):**
  ```
  cd /workspace/osrs/herblore_live
  setsid nohup node server.mjs 8042 >> server.log 2>&1 < /dev/null &
  setsid nohup ./cloudflared tunnel --url http://127.0.0.1:8042 --no-autoupdate > cloudflared.log 2>&1 < /dev/null &
  ```
  (two separate commands; then grep the new public URL from cloudflared.log)

## PROFIT MODEL (wiki-verified 2026-09-13, session 4 + session 5 per-dose revenue)
The user corrected the model: **default crafting yields 3 doses, not 4.**
Verified against the OSRS wiki (Herblore page, Alchemist's amulet page,
Prescription goggles page, per-potion Creation sections):

- **One craft = 3 doses by default** (vial + herb + secondary, e.g. EON on
  guam unf → attack potion(3)).
- **Alchemist's amulet (charged): 15% chance the craft makes 4 doses instead;
  the extra dose consumes NO extra ingredients.**
  → expected doses = 3 + 0.15·amulet
  → the amulet ONLY works on FINISHED POTIONS (adding a secondary to a base
    with <4 doses). It does NOT work on components (haemostatic poultice,
    weapon poison, weapon poison(+)).
- **No amulet effect** on potions that always make 4 doses:
  antidote+, antidote++, anti-venom+, super combat, super antifire
  (yield = 4, flat) — and on guthix rest, which always makes 3 doses.
- **Prescription goggles: 10% chance the secondary ingredient is not consumed
  when mixing** → expected cost = craftCost − 0.10·goggles·secondary.
  - Does NOT save ashes (serum 207) → gogglesSave = 0 for it.
  - Secondary = the ingredient(s) added in the mixing step: last ingredient for
    vial-based potions; all non-base ingredients for potion-based ones
    (e.g. guthix balance = garlic + silver dust; super combat = torstol).

### REVENUE (per-dose based — session 5, Phase 1)
Doses are fungible: **two 3-dose crafts (6 doses) combine into one (4) + one (2).**
So the per-dose value of a 3-dose potion is `(sell4 + sell2) / 6`, and revenue per
craft = expectedDoses × perDoseValue:
- **std**      : `(3 + 0.15·amulet) × (sell4 + sell2) / 6`
- **always3**  : `(sell4 + sell2) / 2`  (guthix rest)
- **always4**  : `sell4`  (each craft is a (4); antidote+, antidote++, anti-venom+,
                 super combat, super antifire)
- **single**   : `sell`  (single-item output, no dose variants: haemostatic
                 poultice, weapon poison, weapon poison(+))

**profit/craft = revenue − (craftCost − 0.10·goggles·gogglesSave·secondary)**
(sell = high after 2% GE tax, cap 5M; sell4 = price of the (4) version,
sell2 = price of the (2) version — both fetched live.)

### Recipe types (how the wiki lists recipes)
- `craft` — the listed recipe IS one 3-dose craft (vial/cup/milk/poultice based,
  e.g. attack = vial+guam+EON; haemostatic dressing = poultice+yarn).
  3-dose cost = listed cost.
- `per4-dose` — listed recipe is the (4) version, secondary used per dose
  (anti-venom = antidote++(4)+20 scales; ext. antifire = antifire(4)+4 shards;
  forgotten brew = ancient brew(4)+80 essence; …).
  3-dose cost = 3/4 of everything (base and secondary).
- `per4-vial` — listed recipe is the (4) version, secondary used once per vial
  (guthix balance = restore(4)+garlic+silver dust).
  3-dose cost = only the (4) base potion scales to 3/4.
  (Detection: secondary qty total % 4 === 0 → per4-dose, else per4-vial.)

### Toggles
- Top 8 sheet: **J4 = amulet (0/1), J5 = goggles (0/1)** — edit in Excel and the
  whole book re-ranks (formulas reference `'Top 8'!$J$4` / `$J$5`).
- Regeneration always resets them to 1/1 (default: both equipped).
- Web dashboard: two checkboxes, same semantics, re-ranks client-side.

### Session-4 changes
- `model.mjs` — NEW shared profit model (used by gen_workbook.mjs + server.mjs).
- `gen_workbook.mjs` — per-row formulas for cost (L), secondary (N), profit (O)
  per recipe type; fixed sheet-ref bug (`Top8!` → `'Top 8'!` — unquoted refs to a
  sheet name containing a space are invalid in Excel).
- `server.mjs` — uses model.mjs; /api/state rows now carry type/recipeType/
  gogglesSave/craftCost/craftSec/cost3/sec3/cost4/sec4 for the client.
- `web/index.html` — client profitOf() implements the same model; labels updated.
- `potions_final.json` — guthix rest recipe fixed (was missing 2 guam;
  wiki: cup + 2 guam + harralander + marrentill → guthix rest(3)).
  Backup of old file: potions_final.json.bak.

### Session-5 changes (Phase 1 — per-dose revenue model)
- **Per-dose revenue model** (see REVENUE above): revenue now uses the (4) AND
  (2) prices. 2×(3) crafts → (4)+(2), so per-dose value = (sell4+sell2)/6.
- `potions_final.json` — each potion now has `id2` (the (2)-dose GE id, from
  `dose_ids.json`) and `single` (bool, true for the 3 single-item outputs:
  haemostatic poultice, weapon poison, weapon poison(+)). 51 potions have id2;
  the 3 single items have id2=null + single=true.
- `model.mjs` — `revenueFor()`/`profitFor()` implement the per-dose model;
  new `single` type; buildRow now returns `sell2` (the (2) sell price).
- `gen_workbook.mjs` — new column **N = Sell price (2)** (VLOOKUP via
  SUBSTITUTE(name,"(4)","(2)")); profit formula (now column **P**) uses the
  per-dose revenue term; rank key moved to column **Q** (Top 8 sheet now
  references Recipes!$Q).
- `update_prices.mjs` — ITEMS now includes each (2)-dose version (so its price
  is fetched). Price list grew 116 → 166 items.
- `server.mjs` — ITEMS includes (2) versions (shown in the prices table);
  /api/state rows carry `sell2`.
- `web/index.html` — client profitOf() implements the per-dose model; footer
  updated.
- **Phase 2 (in progress): unf-potion cost model** — replace "vial + herb"
  ingredients with the tradeable unf (unfinished) potion price, so cost =
  unf price + secondary price (cheaper/easier to buy). Exception: haemostatic
  poultice (it's a component). See "PHASE 2" below.

## HOW IT WORKS
- `potions_final.json` — 54 potion recipes (name, level, xp, ingredients + GE item ids,
  altRecipes). 52 pricable; Surge potion(4) and Sanfew serum(4) are untradeable
  (correctly excluded from ranking).
- `prices_live.json` — current price state: `{id: {low, high, updated, source}}`.
- `update_prices.mjs` — one cycle:
  1. **Source A (preferred):** prices.runescape.wiki v1 summary API (buy=low, sell=high)
     via Jina reader `https://r.jina.ai/<url>` (direct API is Cloudflare-403 from this box).
  2. **Source B (fallback):** OSRS wiki `Module:GEPrices/data.json` via
     `https://oldschool.runescape.wiki/api.php?action=parse&page=Module:GEPrices/data.json&prop=wikitext&format=json`
     (median price; used as both buy and sell). NOTE: `action=parse` works with `page=`,
     NOT with `text=` (that returns "No such action"). The working UA is
     "Mozilla/5.0 (herblore-top8/1.0; price updater)" — plain Chrome UAs got
     Cloudflare-challenged during session 4 (intermittent).
  3. Merges into prices_live.json, backs up the xlsx to `history/` (last 20),
     regenerates the workbook, appends to `update_log.jsonl`.
  4. On total failure: keeps previous prices, logs, exits 0 (loop retries next cycle).
- `model.mjs` — shared profit model (see PROFIT MODEL above).
- `gen_workbook.mjs` — rebuilds the xlsx (pure Node, `xlsx.mjs` = minimal ZIP writer,
  no npm deps):
  - **Top 8 sheet**: LARGE/INDEX/MATCH formulas over Recipes!Q (rank key =
    profit/craft + ROW()/1e6 for tie-breaking) — always exactly the top 8, auto re-ranks.
    Equipment toggles at J4/J5.
  - **Recipes sheet**: all 54 potions; L = cost of the craft performed (VLOOKUP sums,
    3/4-scaled where the recipe is the (4) version), M = sell (4), N = sell (2),
    O = secondary cost of the craft, P = profit/craft formula (all formulas,
    blank if unpriceable), Q = rank key (hidden).
  - **Prices sheet**: 166 items (incl. (2)-dose versions), buy/sell values
    (rewritten each cycle) + last-updated.
  - Sell price = high − min(floor(high×0.02), 5M) (GE tax).
- `run_live.mjs [intervalMs]` — standalone 5-min loop (SUPERSEDED by server.mjs;
  kept for reference, do not run while the server is up).
- `server.mjs [port]` — localhost website (127.0.0.1:8042) + owns the 5-min
  price-update cycle (spawns update_prices.mjs as a child, guarded against overlap).
- `web/index.html` — dashboard page (vanilla JS, no deps).
- `xlsx.mjs` — dependency-free xlsx writer (deflate ZIP, inline strings, formulas w/ cache).

## CURRENT TOP 8 (2026-09-13 ~21:45 UTC, wiki-median source, amulet+goggles on)
Prayer regen 942 | Ext. anti-venom+ 867 | Haemostatic poultice 864 | Goading 675 |
Super combat 483 | Prayer 239 | Guthix rest 161 | Battlemage 116
(profit/craft in coins; ranks re-compute every 5 min as prices change)

## PHASE 2 — unf-potion cost model (✅ DONE)
All vial-based potions (34, incl. haemostatic poultice) now use the tradeable
**unf (unfinished) potion** as the base ingredient instead of "vial + herb",
so cost = unf price + secondary price. `unf_ids.json` maps each herb → its
unf GE id (18 unique, fetched from the wiki infobox `id` field). Applied by
rewriting `potions_final.json` ingredients (backup: potions_final.json.bak2).
- **Kept as-is (no unf):** guthix rest (cup + 2 guam + harralander + marrentill,
  multi-herb), bastion/battlemage (vial of blood), antidote+/++ & weapon poison(+)
  (coconut milk), and all potion-based (per4) recipes (already use a base(4)).
- The model.mjs cost logic is unchanged (it just sums ingredient prices); the
  unf is now one of those ingredients. Goggles still save the secondary.
- Price list grew 166 → 172 items (added the 18 unfs, minus overlaps).

## KNOWN ISSUES / CAVEATS
- The price API (and Jina's route to it) is intermittently Cloudflare-challenged;
  when blocked the updater falls back to wiki medians (updated a few times/day by
  the wiki, less granular than live low/high). If Jina recovers, source A resumes
  automatically — no action needed.
- Per-dose revenue uses (sell4+sell2)/6. For rare potions the wiki-median (4)/(2)
  prices can be inconsistent (small trade sample) — e.g. guthix balance (2) swung
  9799→522 in one cycle. Live low/high (source A) is more reliable when available.
- 3/4 scaling of (4) base-potion prices to (3) is an approximation (real (3)
  prices differ a little).
- Haemostatic dressing: modelled as "buy poultice from GE + yarn"; the wiki says
  the goggles can also save the squid paste if you make the poultice yourself —
  not counted here (consistent with how all other base potions are bought).
- Sanity check warns when a price moves >5x in one cycle (expected once when the
  source switches between low/high and median).
- python3 and curl are NOT installed; everything is Node. No npm deps.
- Tie-breaking: rank key adds ROW()/1e6 so two potions with identical profit can't
  both occupy a Top-8 slot.

## FILE MAP (herblore_live/)
- RESTORE_POINT.md ← this file
- herblore_top8.xlsx ← THE DELIVERABLE
- prices_live.json, update_log.jsonl, live_loop.log, history/
- model.mjs ← shared profit model (session 4)
- build_recipes.mjs → potions_final.json (recipe data, done)
- calc_profit.mjs → potions_profit.json (one-off analysis, superseded)
- calc_rows.json (wiki calculator cross-check), potions.json (herb table),
  mapping_fresh.json / latest_fresh.json (initial price snapshot)
- xlsx.mjs, gen_workbook.mjs, update_prices.mjs, run_live.mjs (superseded),
  server.mjs, web/index.html, server.log
- cloudflared (static binary), cloudflared.log — public tunnel (see above)
- web/img/ (116 item icons), images.json, fetch_images.mjs
