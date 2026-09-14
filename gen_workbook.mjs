#!/usr/bin/env node
/**
 * Build herblore_top8.xlsx from potions_final.json + prices_live.json.
 *
 * Profit model — expected value per CRAFT (see model.mjs for the wiki-verified
 * mechanics; equipment toggles live on the "Top 8" sheet, J4/J5, 0/1):
 *  - One craft makes 3 doses by default. Doses are fungible: two 3-dose crafts
 *    (6 doses) combine into one (4) + one (2). So the per-dose value of a
 *    3-dose potion is (sell4 + sell2) / 6 and revenue per craft is
 *    expectedDoses * perDoseValue.
 *  - Alchemist's amulet (J4): 15% chance the craft makes 4 doses instead
 *    (extra dose is free) -> expected doses = 3 + 0.15*J4. Only works on
 *    finished potions (not components). No effect on potions that always make
 *    4 doses (antidote+, antidote++, anti-venom+, super combat, super antifire)
 *    or guthix rest (always 3).
 *  - Prescription goggles (J5): 10% chance the secondary ingredient is not
 *    consumed -> expected cost = craftCost - 0.10*J5*secondary (no effect on
 *    serum 207, which doesn't save ashes).
 *  - revenue/craft:
 *      std      = (3 + 0.15*J4) * (sell4 + sell2) / 6
 *      always3  = (sell4 + sell2) / 2
 *      always4  = sell4          (each craft is a (4))
 *      single   = sell           (single-item output, no dose variants)
 *    profit/craft = revenue - (craftCost - 0.10*J5*gogglesSave*secondary)
 *    (sell = high after 2% GE tax, cap 5M; sell4 = price of the (4) version,
 *     sell2 = price of the (2) version.)
 *
 * Sheets:
 *  - "Top 8"   : dynamic — LARGE/INDEX/MATCH over Recipes!Q, always the top 8
 *                by profit/craft; re-ranks whenever prices or toggles change.
 *  - "Recipes" : all potions; cost/sell/secondary/profit are FORMULAS
 *                referencing "Prices" and the Top-8 toggle cells.
 *  - "Prices"  : buy/sell per item. Plain values, rewritten by update_prices.mjs.
 */
import fs from "node:fs";
import { buildXlsx, sheetXml } from "./xlsx.mjs";
import { buildRow, profitFor, tax } from "./model.mjs";

const HERE = new URL(".", import.meta.url);
const POTIONS = JSON.parse(fs.readFileSync(new URL("./potions_final.json", HERE), "utf8"));
const PRICES = JSON.parse(fs.readFileSync(new URL("./prices_live.json", HERE), "utf8"));

const AMULET = 1; // cached-value assumption (toggles live in the sheet)
const GOGGLES = 1;
const T8 = "'Top 8'"; // sheet ref (quoted — name contains a space)

// ---------- item list (prices sheet) ----------
const items = new Map(); // name -> {id}
for (const p of POTIONS) {
	if (p.id != null) items.set(p.name, { id: p.id });
	if (p.id2 != null) items.set(p.name.replace(/\(4\)$/, "") + "(2)", { id: p.id2 }); // (2)-dose version
	for (const ing of p.ingredients) if (ing.id != null) items.set(ing.name, { id: ing.id });
	for (const ing of p.altRecipes || []) if (ing.id != null) items.set(ing.name, { id: ing.id });
}
const itemList = [...items.entries()].sort((a, b) => a[0].localeCompare(b[0]));
const N_ITEMS = itemList.length;
const P_LAST = N_ITEMS + 1; // last row of Prices sheet

// ---------- rows ----------
const potRows = POTIONS.map((p) => buildRow(p, PRICES));
for (const r of potRows) r.profit = profitFor(r, AMULET, GOGGLES);

// ---------- Prices sheet ----------
const priceRows = [
	[
		{ v: "Item", s: 1 }, { v: "ID", s: 1 }, { v: "Buy price", s: 1 },
		{ v: "Sell price (after 2% GE tax)", s: 1 }, { v: "Last updated (UTC)", s: 1 },
	],
];
for (const [name, { id }] of itemList) {
	const d = PRICES[id];
	const t = d?.updated ? new Date(d.updated).toISOString().replace("T", " ").slice(0, 16) : "";
	priceRows.push([
		{ v: name }, { v: id, s: 2 },
		{ v: d?.low ?? null, s: 2 }, { v: d?.high != null ? tax(d.high) : null, s: 2 },
		{ v: t, s: 5 },
	]);
}

// ---------- Recipes sheet ----------
// A Potion | B Level | C XP | D..K ing1..4 name/qty | L Cost to make (per craft)
// M Sell price (4) | N Sell price (2) | O Secondary cost (per craft)
// P Profit/craft | Q GP/h | R RankKey (hidden)
const R_FIRST = 2;
const R_LAST = R_FIRST + potRows.length - 1;
const NAME_COLS = ["D", "F", "H", "J"];
const QTY_COLS = ["E", "G", "I", "K"];
const recipeRows = [
	[
		{ v: "Potion", s: 1 }, { v: "Level", s: 1 }, { v: "XP", s: 1 },
		{ v: "Ingredient 1", s: 1 }, { v: "Qty", s: 1 },
		{ v: "Ingredient 2", s: 1 }, { v: "Qty", s: 1 },
		{ v: "Ingredient 3", s: 1 }, { v: "Qty", s: 1 },
		{ v: "Ingredient 4", s: 1 }, { v: "Qty", s: 1 },
		{ v: "Cost to make (per craft)", s: 1 }, { v: "Sell price (4)", s: 1 },
		{ v: "Sell price (2)", s: 1 }, { v: "Secondary cost (per craft)", s: 1 },
		{ v: "Profit / craft", s: 1 }, { v: "GP/h", s: 1 }, { v: "Rank key (hidden)", s: 5 },
	],
];
potRows.forEach((r, i) => {
	const row = R_FIRST + i;
	const ings = r.ingredients;
	const ingCells = [];
	for (let k = 0; k < 4; k++) {
		ingCells.push({ v: ings[k]?.name ?? null }, { v: ings[k]?.qty ?? null, s: 2 });
	}
	const lookup = (nameRef) => `IF(${nameRef}="","",VLOOKUP(${nameRef},Prices!$A$2:$D$${P_LAST},3,0))`;
	// sum of VLOOKUP*qty over a set of ingredient slots
	const sumOver = (slotIdxs) =>
		slotIdxs
			.map((k) => `(${lookup("$" + NAME_COLS[k] + row)}*$${QTY_COLS[k]}${row})`)
			.join("+");
	const allSlots = ings.map((_, k) => k).filter((k) => ings[k]);
	const cost4F = `IFERROR(${sumOver(allSlots)},"")`;
	const baseSlots = allSlots.filter((k) => ings[k].name.includes("(4)"));
	const secSlots = allSlots.filter((k) => r.secondaries.includes(ings[k].name));
	const sec4F = `IFERROR(${sumOver(secSlots)},"")`;

	// L = cost of the craft actually performed; O = its secondary cost
	let costF, secF;
	if (r.type === "always4" || r.type === "single" || r.recipeType === "craft") {
		costF = cost4F;
		secF = sec4F;
	} else if (r.recipeType === "per4-dose") {
		costF = `IFERROR(0.75*(${sumOver(allSlots)}),"")`;
		secF = `IFERROR(0.75*(${sumOver(secSlots)}),"")`;
	} else {
		// per4-vial: only the (4) base potion scales to 3/4
		costF = `IFERROR(${sumOver(allSlots)}-0.25*(${sumOver(baseSlots)}),"")`;
		secF = sec4F;
	}

	// M = sell price (4) (or the single-item price for single items)
	const sellF = `IFERROR(VLOOKUP($A${row},Prices!$A$2:$D$${P_LAST},4,0),"")`;
	// N = sell price (2) — only for potions that have a (4) dose variant
	const sell2F = `IF(ISNUMBER(SEARCH("(4)",$A${row})),IFERROR(VLOOKUP(SUBSTITUTE($A${row},"(4)","(2)"),Prices!$A$2:$D$${P_LAST},4,0),""),"")`;

	// P = profit/craft (revenue term depends on potion type; goggles term on gogglesSave)
	const revenueTerm =
		r.type === "always4" ? `$M${row}`
		: r.type === "single" ? `$M${row}`
		: r.type === "always3" ? `($M${row}+$N${row})/2`
		: `(3+0.15*${T8}!$J$4)*($M${row}+$N${row})/6`;
	const gogglesTerm = r.gogglesSave ? `0.1*${T8}!$J$5*$O${row}` : "0";
	const profitF = `IF(OR($L${row}="",$M${row}=""),"",${revenueTerm}-($L${row}-${gogglesTerm}))`;
	// GP/h = profit/craft * crafts/hour (OSRS wiki: 2 ticks/craft = 3000/h; guthix rest 1 tick = 6000/h)
	const gpH = r.name === "Guthix rest(4)" ? 6000 : 3000;
	const gpHF = `IF($P${row}="","",$P${row}*${gpH})`;
	const rankF = `IF($P${row}="","",$P${row}+ROW()/1000000)`;

	recipeRows.push([
		{ v: r.name }, { v: r.level, s: 2 }, { v: r.xp, s: 4 },
		...ingCells,
		{ v: r.craftCost, f: costF, s: 2 }, { v: r.sell, f: sellF, s: 2 },
		{ v: r.sell2, f: sell2F, s: 2 },
		{ v: r.craftSec, f: secF, s: 2 },
		{ v: r.profit, f: profitF, s: 2 },
		{ v: r.profit != null ? r.profit * gpH : null, f: gpHF, s: 2 },
		{ v: r.profit != null ? r.profit + (row + 1) / 1e6 : null, f: rankF, s: 5 },
	]);
});

// ---------- Top 8 sheet ----------
const top8 = [...potRows].filter((x) => x.profit != null).sort((a, b) => b.profit - a.profit).slice(0, 8);
const now = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
let src = "";
{
	let best = 0;
	for (const d of Object.values(PRICES)) if (d.updated > best) best = d.updated;
	for (const d of Object.values(PRICES)) if (d.updated === best && d.source) src = d.source;
}
const srcLabel =
	src === "price-api" ? "price API (buy=GE low, sell=GE high)"
	: src === "wiki-median" ? "wiki median GE price (buy=sell=median)"
	: "";
const topRows = [
	[{ v: "TOP 8 MOST PROFITABLE HERBLORE POTIONS (live)", s: 1 }],
	[{ v: `Last price update: ${now} — auto-refreshes every 5 minutes (server.mjs). Source: ${srcLabel}.`, s: 5 }],
	[
		{ v: "Rank", s: 1 }, { v: "Potion", s: 1 }, { v: "Level", s: 1 }, { v: "XP", s: 1 },
		{ v: "Cost to make (per craft)", s: 1 }, { v: "Sell price (4)", s: 1 }, { v: "Profit / craft", s: 1 },
		{ v: "GP/h", s: 1 },
		{ v: "Equipment (0/1)", s: 1 }, { v: null, s: 1 },
	],
];
for (let k = 0; k < 8; k++) {
	const r = k + 4; // sheet rows: header=3, data 4..11
	const m = `MATCH($G${r},Recipes!$R$2:$R$${R_LAST},0)`;
	const idx = (col) => `INDEX(Recipes!$${col}$2:$${col}$${R_LAST},${m})`;
	const gF = `IFERROR(LARGE(Recipes!$R$2:$R$${R_LAST},${k + 1}),"")`;
	const row = top8[k];
	const gpH = row ? (row.name === "Guthix rest(4)" ? 6000 : 3000) : 3000;
	topRows.push([
		{ v: k + 1, s: 2 },
		{ v: row ? row.name : null, f: `IF($G${r}="","",${idx("A")})` },
		{ v: row ? row.level : null, f: `IF($G${r}="","",${idx("B")})`, s: 2 },
		{ v: row ? row.xp : null, f: `IF($G${r}="","",${idx("C")})`, s: 4 },
		{ v: row ? row.craftCost : null, f: `IF($G${r}="","",${idx("L")})`, s: 2 },
		{ v: row ? row.sell : null, f: `IF($G${r}="","",${idx("M")})`, s: 2 },
		{ v: row ? row.profit : null, f: gF, s: 2 },
		{ v: row ? row.profit * gpH : null, f: `IF($G${r}="","",${idx("Q")})`, s: 2 },
		{ v: k === 0 ? "Alchemist's amulet (15%: 4 doses instead of 3)" : k === 1 ? "Prescription goggles (10%: secondary not consumed)" : null, s: 5 },
		{ v: k === 0 ? AMULET : k === 1 ? GOGGLES : null, s: 2 },
	]);
}
topRows.push([
	{
		v: "One craft = 3 doses; doses are fungible (2×(3) → (4)+(2)). Profit/craft = doses·(sell(4)+sell(2))/6 − (craft cost − 10%·goggles·secondary cost); " +
			"doses = 3 + 15%·amulet for normal potions, 3 for guthix rest, 4 for always-4 potions (antidote+, antidote++, anti-venom+, super combat, super antifire) which sell as a (4) and are not amulet-boosted; " +
			"the amulet does not work on components (haemostatic poultice, weapon poison); goggles don't save serum 207 ashes. Sell = after 2% GE tax (cap 5M). " +
			"Set J4/J5 to 0 to rank without the equipment. Full list of all 54 potions on the Recipes sheet.",
		s: 5,
	},
]);

// ---------- write ----------
const xlsx = buildXlsx([
	{ name: "Top 8", xml: sheetXml(topRows, [6, 34, 8, 8, 18, 12, 15, 12, 44, 10]) },
	{ name: "Recipes", xml: sheetXml(recipeRows, [30, 8, 8, 26, 6, 26, 6, 26, 6, 26, 6, 16, 12, 12, 16, 14, 12, 12]) },
	{ name: "Prices", xml: sheetXml(priceRows, [34, 9, 13, 24, 19]) },
]);
fs.writeFileSync(new URL("./herblore_top8.xlsx", HERE), xlsx);
console.log(`wrote herblore_top8.xlsx (${xlsx.length} bytes, ${N_ITEMS} priced items, ${potRows.length} recipes)`);
console.log("current top 8 (amulet + goggles on):");
for (const t of top8) console.log(`  ${t.name.padEnd(34)} profit/craft ${Math.round(t.profit)}`);
