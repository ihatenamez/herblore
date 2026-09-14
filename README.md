# OSRS Herblore — Top 8 most profitable potions (live)

A live dashboard + Excel workbook that always shows the **top 8 most profitable
herblore potions**, re-ranking automatically as Grand Exchange prices change.

- **Live-updating** buy/sell prices for all potions and ingredients.
- **Equipment modelling** (Alchemist's amulet + Prescription goggles) with the
  correct 3-dose base crafting model.
- **GP/h** for every potion (crafting speed from the OSRS wiki).
- **Dynamic top 8** — always re-ranks by current profit.
- **Downloadable .xlsx** with live formulas.

## How it works

| Piece | File | Role |
|-------|------|------|
| Profit model | `model.mjs` | wiki-verified mechanics (doses, amulet, goggles, GP/h) |
| Recipes | `potions_final.json` | 54 potion recipes (GE item IDs, ingredients, alts) |
| Prices | `prices_live.json` | current buy/sell per item (updated every run) |
| Price fetcher | `update_prices.mjs` | pulls OSRS wiki median prices |
| Workbook | `gen_workbook.mjs` → `herblore_top8.xlsx` | 3 sheets (Top 8 / Recipes / Prices) |
| Live server | `server.mjs` | localhost dashboard + 5-min update loop |
| **Static build** | `build_static.mjs` → `public/` | GitHub Pages site (data baked into `state.json`) |
| **Auto-updater** | `.github/workflows/update.yml` | refreshes prices on a schedule |

## Deploy to GitHub Pages

1. **Create a repo** on GitHub (e.g. `herblore-top8`) and push this folder:
   ```bash
   git init
   git add -A
   git commit -m "herblore top-8 dashboard"
   git branch -M main
   git remote add origin https://github.com/<you>/herblore-top8.git
   git push -u origin main
   ```

2. **Enable Pages**: repo → *Settings* → *Pages* → *Source* = **Deploy from a
   branch** → branch `main`, folder **`/root` (or `public`)**.
   - If you point Pages at the **`public/`** folder, the site is served from
     `https://<you>.github.io/herblore-top8/`.
   - (The `public/` folder is already committed and rebuilt by the workflow.)

3. **Live updates**: the `update.yml` workflow runs every ~15 min, fetches the
   latest OSRS wiki prices, rebuilds `state.json` + the xlsx, and commits. Pages
   then serves the fresh data. You can also trigger it manually via *Actions* →
   *Update prices* → *Run workflow*.

> The site is static — prices are baked into `public/state.json` and refreshed
> by the workflow (not a running server). The dashboard re-checks the file every
> 30 s in the browser.

## Run locally (optional)

The full live server (5-min updates, no GitHub needed):
```bash
node server.mjs 8042          # -> http://127.0.0.1:8042/
```

Rebuild artifacts manually:
```bash
node update_prices.mjs        # refresh prices_live.json
node gen_workbook.mjs         # rebuild herblore_top8.xlsx
node build_static.mjs         # rebuild public/ (GitHub Pages site)
```

## Notes

- **Prices**: OSRS wiki median (the live price API is Cloudflare-blocked from
  most servers). Buy = sell = median for wiki-sourced items.
- **Sell price** is after the 2% Grand Exchange tax (capped at 5M).
- **GP/h** = profit/craft × crafts/hour; crafting speed from the OSRS wiki
  (2 ticks/craft = 3000/h; Guthix rest 1 tick = 6000/h).
- **Untradeable** potions (Surge, Sanfew) can't be priced and are excluded.
