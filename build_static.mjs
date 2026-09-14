#!/usr/bin/env node
/**
 * build_static.mjs — build a static GitHub Pages site from the live data.
 *
 * GitHub Pages is static-only (no server, no cron), so this bakes the current
 * prices into `public/state.json` and rewrites the dashboard to load it
 * directly. A GitHub Actions workflow (see .github/workflows/update.yml)
 * re-runs update_prices.mjs + gen_workbook.mjs + this script on a schedule
 * and commits the result, which is what keeps the Pages site "live".
 *
 * Output (public/):
 *   index.html          — dashboard, loads ./state.json
 *   state.json          — potions + prices (same shape as /api/state)
 *   herblore_top8.xlsx  — current workbook
 *   img/                — item icons
 */
import fs from "node:fs";
import { buildRow, profitFor, tax } from "./model.mjs";

const HERE = new URL(".", import.meta.url);
const OUT = new URL("./docs/", HERE);

const POTIONS = JSON.parse(fs.readFileSync(new URL("./potions_final.json", HERE), "utf8"));
const IMAGES = JSON.parse(fs.readFileSync(new URL("./images.json", HERE), "utf8"));
const PRICES = JSON.parse(fs.readFileSync(new URL("./prices_live.json", HERE), "utf8"));

// name -> id for every pricable item (potions + (2) + ingredients + alts)
const ITEMS = new Map();
for (const p of POTIONS) {
	if (p.id != null) ITEMS.set(p.name, p.id);
	if (p.id2 != null) ITEMS.set(p.name.replace(/\(4\)$/, "") + "(2)", p.id2);
	for (const ing of p.ingredients) if (ing.id != null) ITEMS.set(ing.name, ing.id);
	for (const ing of p.altRecipes || []) if (ing.id != null) ITEMS.set(ing.name, ing.id);
}

function computeRows(prices) {
	return POTIONS.map((p) => {
		const r = buildRow(p, prices, IMAGES);
		return {
			...r,
			cost: r.craftCost,
			secCost: r.craftSec,
			secName: r.secondaries.join(", "),
			profit: profitFor(r, 1, 1),
		};
	});
}

function stateJson() {
	let lastUpdate = 0;
	let source = "";
	for (const d of Object.values(PRICES)) if (d.updated > lastUpdate) lastUpdate = d.updated;
	for (const d of Object.values(PRICES)) if (d.updated === lastUpdate && d.source) source = d.source;
	const priceList = {};
	for (const [name, id] of ITEMS) {
		const d = PRICES[id];
		if (!d) continue;
		priceList[name] = {
			img: IMAGES[name] ?? null,
			buy: d.low ?? null,
			sell: d.high != null ? tax(d.high) : null,
			updated: d.updated ? new Date(d.updated).toISOString() : null,
		};
	}
	return {
		generatedAt: new Date().toISOString(),
		lastPriceUpdate: lastUpdate ? new Date(lastUpdate).toISOString() : null,
		source,
		potions: computeRows(PRICES),
		prices: priceList,
	};
}

// ---------- write the static site ----------
fs.mkdirSync(new URL("./img/", OUT), { recursive: true });

fs.writeFileSync(new URL("state.json", OUT), JSON.stringify(stateJson()));

// index.html — rewrite the live dashboard to load ./state.json
let html = fs.readFileSync(new URL("./web/index.html", HERE), "utf8");
html = html.replace(
	'const API = location.protocol === "file:" ? "http://127.0.0.1:8042" : "";',
	'const API = ""; // static build (GitHub Pages) — data comes from ./state.json',
);
html = html.replace(
	/\/\/ Works both when served by server\.mjs[\s\S]*?\n\n/, // drop the live/file:// comment
	"\n",
);
html = html.replace(/if \(location\.protocol === "file:"\)\s*\{[\s\S]*?\}\n/, "");
html = html.replace(
	'const r = await fetch(API + "/api/state", { cache: "no-store" });',
	'const r = await fetch("state.json", { cache: "no-store" });',
);
// image URLs: ${API}/img/... -> img/... (relative, so it works under /herblore/ subpath)
html = html.replace(/\$\{API\}\/img\//g, "img/");
html = html.replace(
	"Prices refresh every 5 min · page auto-refreshes every 30 s",
	"Prices auto-refresh via GitHub Actions (~15 min) · page re-checks every 30 s",
);
fs.writeFileSync(new URL("index.html", OUT), html);

// xlsx
fs.copyFileSync(new URL("./herblore_top8.xlsx", HERE), new URL("herblore_top8.xlsx", OUT));

// icons
const imgDir = new URL("./web/img/", HERE);
for (const f of fs.readdirSync(imgDir)) {
	fs.copyFileSync(new URL(f, imgDir), new URL(f, new URL("./img/", OUT)));
}

const n = Object.keys(stateJson().prices).length;
console.log(`wrote static site to docs/ (${n} priced items, ${POTIONS.length} potions)`);
