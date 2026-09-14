#!/usr/bin/env node
/**
 * Compute per-potion profit for all herblore recipes.
 * - Cost: buy LOW price (what you pay on GE) x qty, per ingredient
 * - Sell: high price minus 2% GE tax (capped at 5M)
 * - For potions with altRecipes, use the cheaper recipe.
 * Cross-checks total ingredient cost against the wiki Calculator:Herblore/Potions
 * (calc_rows.json) where the potion appears there.
 */
import fs from "node:fs";

const POTIONS = JSON.parse(fs.readFileSync(new URL("./potions_final.json", import.meta.url), "utf8"));
const LATEST = JSON.parse(fs.readFileSync(new URL("./latest_fresh.json", import.meta.url), "utf8"));
const CALC = JSON.parse(fs.readFileSync(new URL("./calc_rows.json", import.meta.url), "utf8"));

function price(id, key) {
	if (id == null) return null;
	const d = LATEST[String(id)];
	return d && d[key] != null ? d[key] : null;
}

function sellHigh(id) {
	const h = price(id, "high");
	if (h == null) return null;
	return h - Math.min(Math.floor(h * 0.02), 5_000_000);
}

function buyLow(id) {
	return price(id, "low");
}

// wiki calculator rows keyed by (level, xp) -> cost (potionCost is the total ingredient cost)
const CALC_KEY = new Map(CALC.map((r) => [`${r.level}|${r.xp}`, r]));

const out = [];
const problems = [];
for (const p of POTIONS) {
	// choose cheapest recipe
	let best = { cost: null, ings: p.ingredients, label: "main" };
	const alts = p.altRecipes && p.altRecipes.length ? [{ ings: p.altRecipes, label: "alt" }] : [];
	for (const cand of [best, ...alts]) {
		let cost = 0;
		let ok = true;
		for (const ing of cand.ings) {
			const low = buyLow(ing.id);
			if (low == null) { ok = false; break; }
			cost += low * ing.qty;
		}
		if (ok && (best.cost == null || cost < best.cost)) best = { ...cand, cost };
	}
	if (best.cost == null) {
		problems.push(`${p.name}: missing price data`);
		continue;
	}
	const sell = sellHigh(p.id);
	const row = {
		name: p.name,
		level: p.level,
		xp: p.xp,
		recipe: best.label,
		cost: best.cost,
		sell: sell,
		profit: sell != null ? sell - best.cost : null,
	};
	// cross-check vs wiki calculator
	const cr = CALC_KEY.get(`${p.level}|${p.xp}`);
	if (cr) {
		const wikiCost = Number(cr.potionCost.replace(/,/g, ""));
		row.wikiCost = wikiCost;
		row.costDiff = best.cost - wikiCost;
	}
	out.push(row);
}

// sort by level
out.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

console.table(out.map((r) => ({
	potion: r.name,
	lvl: r.level,
	cost: r.cost,
	sell: r.sell,
	profit: r.profit,
	wiki: r.wikiCost,
	diff: r.costDiff,
})));

if (problems.length) {
	console.log("\nproblems:");
	for (const p of problems) console.log(" -", p);
}
// cross-check summary
const checked = out.filter((r) => r.wikiCost != null);
const close = checked.filter((r) => Math.abs(r.costDiff) <= Math.max(5, r.wikiCost * 0.02));
console.log(`\ncross-check vs wiki calculator: ${checked.length} potions matched, ${close.length} within 2%`);
for (const r of checked) {
	if (Math.abs(r.costDiff) > Math.max(5, r.wikiCost * 0.02)) {
		console.log(`  MISMATCH ${r.name}: ours=${r.cost} wiki=${r.wikiCost} (diff ${r.costDiff})`);
	}
}

fs.writeFileSync(new URL("./potions_profit.json", import.meta.url), JSON.stringify(out, null, 2));
console.log("\nwrote potions_profit.json");
