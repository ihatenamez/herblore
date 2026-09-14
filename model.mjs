// model.mjs — shared herblore profit model.
//
// Mechanics (OSRS wiki, verified 2026-09-13):
//  - One craft makes 3 doses by default (vial + herb + secondary).
//  - Alchemist's amulet (charged): 15% chance the craft makes 4 doses
//    instead; the extra dose consumes no extra ingredients.
//    The amulet only works on FINISHED POTIONS (adding a secondary to a
//    base with fewer than 4 doses) — NOT on components (haemostatic
//    poultice, weapon poison, …).
//      -> expected doses per craft = 3 + 0.15 * amulet  (std potions only)
//  - Potions that ALWAYS make 4 doses (amulet has no effect):
//      antidote+, antidote++, anti-venom+, super combat, super antifire
//  - Guthix rest ALWAYS makes 3 doses (amulet has no effect).
//  - Prescription goggles: 10% chance the secondary ingredient is not
//    consumed when mixing the potion
//      -> expected savings = 0.10 * goggles * secondaryCost
//    The goggles do NOT save ashes (serum 207).
//
// REVENUE (per-dose based):
//   Doses are fungible — you can combine/split them.  Two 3-dose crafts
//   (6 doses) combine into one (4) + one (2).  So the per-dose value of a
//   3-dose potion is  (sell4 + sell2) / 6, and revenue per craft is
//   expectedDoses * perDoseValue:
//     std      : (3 + 0.15*amulet) * (sell4 + sell2) / 6
//     always3  : 3 * (sell4 + sell2) / 6  =  (sell4 + sell2) / 2
//   Potions that always make 4 doses sell as a (4): revenue = sell4.
//   Single items (no dose variants) sell at their own price: revenue = sell.
//   (sell = high after 2% GE tax, cap 5M; sell4 = price of the (4) version,
//    sell2 = price of the (2) version.)
//
// COST:
//   expectedCost = craftCost - 0.10 * goggles * gogglesSave * craftSecondary
//     where craftCost / craftSecondary are the costs of the craft performed.
//
// profit/craft = revenue - expectedCost
//
// Recipe types (from the wiki's per-dose recipes):
//  - "craft"     : recipe as listed IS one 3-dose craft
//                  (vial/cup/milk/poultice based, e.g. attack = vial+guam+EON)
//  - "per4-dose" : recipe as listed is the (4) version and the secondary is
//                  used per dose (e.g. anti-venom = antidote++(4) + 20 scales)
//                  -> 3-dose craft = 3/4 of everything
//  - "per4-vial" : recipe as listed is the (4) version but the secondary is
//                  used once per vial (e.g. guthix balance = restore(4) +
//                  garlic + silver dust) -> only the base potion scales to 3/4

export const ALWAYS4 = new Set([
	"Antidote+(4)",
	"Antidote++(4)",
	"Anti-venom+(4)",
	"Super combat potion(4)",
	"Super antifire potion(4)",
]);
export const ALWAYS3 = new Set(["Guthix rest(4)"]);
export const NO_GOGGLES = new Set(["Serum 207 (4)"]); // goggles don't save ashes

export const tax = (h) => h - Math.min(Math.floor(h * 0.02), 5_000_000);

const has4 = (name) => name.includes("(4)");

/**
 * Classify a recipe (chosen ingredient list) and pick its secondaries.
 * secondary = the ingredient(s) added in the mixing step:
 *  - potion-based recipes: everything that is not a (4) base potion
 *  - vial/cup/milk/poultice recipes: the last ingredient
 */
export function classify(ings) {
	const baseIsPotion = has4(ings[0].name);
	const secondaries = baseIsPotion ? ings.filter((i) => !has4(i.name)) : [ings[ings.length - 1]];
	const secQty = secondaries.reduce((s, i) => s + i.qty, 0);
	const recipeType = !baseIsPotion ? "craft" : secQty % 4 === 0 ? "per4-dose" : "per4-vial";
	return { baseIsPotion, secondaries, recipeType };
}

/**
 * Build one potion row with all model parameters + cached prices.
 * prices: {id: {low, high, updated, source}}
 */
export function buildRow(p, prices, IMAGES) {
	const buy = (id) => (id != null && prices[id]?.low != null ? prices[id].low : null);
	const sellP = (id) => (id != null && prices[id]?.high != null ? tax(prices[id].high) : null);
	const costOf = (ings) => {
		let c = 0;
		for (const i of ings) {
			const b = buy(i.id);
			if (b == null) return null;
			c += b * i.qty;
		}
		return c;
	};

	// cheapest recipe wins (main vs alts)
	let best = null;
	let bestIngs = p.ingredients;
	for (const cand of [p.ingredients, ...(p.altRecipes?.length ? [p.altRecipes] : [])]) {
		const c = costOf(cand);
		if (c != null && (best == null || c < best)) {
			best = c;
			bestIngs = cand;
		}
	}

	const { secondaries, recipeType } = classify(bestIngs);
	let sec4 = 0;
	let ok = best != null;
	for (const s of secondaries) {
		const b = buy(s.id);
		if (b == null) {
			ok = false;
			break;
		}
		sec4 += b * s.qty;
	}
	const basePrice = bestIngs
		.filter((i) => has4(i.name))
		.reduce((s, i) => s + (buy(i.id) ?? 0) * i.qty, 0);
	const s = sellP(p.id); // sell4 (or the single-item price for single items)
	const s2 = p.id2 != null ? sellP(p.id2) : null; // sell2 ((2)-dose version)

	// "single" = a component / single-item output with no dose variants
	// (haemostatic poultice, weapon poison, weapon poison(+)).
	const type = p.single
		? "single"
		: ALWAYS4.has(p.name)
			? "always4"
			: ALWAYS3.has(p.name)
				? "always3"
				: "std";
	const gogglesSave = NO_GOGGLES.has(p.name) ? 0 : 1;

	// 3-dose craft costs (only meaningful for std / always3)
	const cost3 =
		recipeType === "craft" ? best : recipeType === "per4-dose" ? 0.75 * best : best - 0.25 * basePrice;
	const sec3 = recipeType === "craft" ? sec4 : recipeType === "per4-dose" ? 0.75 * sec4 : sec4;

	// the craft actually performed: always-4 & single use the (4)/listed recipe
	const craftCost = type === "std" || type === "always3" ? cost3 : best;
	const craftSec = type === "std" || type === "always3" ? sec3 : sec4;

	return {
		name: p.name,
		level: p.level,
		xp: p.xp,
		img: IMAGES?.[p.name] ?? null,
		ingredients: bestIngs.map((i) => ({ name: i.name, qty: i.qty })),
		secondaries: secondaries.map((i) => i.name),
		recipeType,
		type,
		gogglesSave,
		cost4: best,
		sec4,
		cost3: best != null ? cost3 : null,
		sec3: ok ? sec3 : null,
		craftCost: ok ? craftCost : null,
		craftSec: ok ? craftSec : null,
		sell: s, // sell4 (or single-item price)
		sell2: s2, // sell2 ((2)-dose version; null for single/always4)
		pricable: ok && s != null && (type === "single" || type === "always4" || s2 != null),
	};
}

/**
 * Expected revenue per craft (per-dose based).
 *  std      : (3 + 0.15*A) * (sell4 + sell2) / 6
 *  always3  : (sell4 + sell2) / 2
 *  always4  : sell4
 *  single   : sell (single-item price)
 */
export function revenueFor(r, A) {
	if (!r.pricable) return null;
	if (r.type === "always4") return r.sell;
	if (r.type === "single") return r.sell;
	const perDose = (r.sell + r.sell2) / 6;
	const doses = r.type === "always3" ? 3 : 3 + 0.15 * A;
	return doses * perDose;
}

/**
 * Expected profit per craft.
 * A = amulet (0/1), G = goggles (0/1).
 */
export function profitFor(r, A, G) {
	if (!r.pricable) return null;
	const rev = revenueFor(r, A);
	const cost = r.craftCost - 0.1 * G * r.gogglesSave * r.craftSec;
	return rev - cost;
}

// Crafting speed (OSRS wiki "ticks" in each potion's Creation section):
// 2 ticks per craft for every potion except Guthix rest (1 tick). 1 tick = 0.6s.
// -> 3000 crafts/hour (most) or 6000 (Guthix rest).
export const craftsPerHour = (name) => 3600 / ((name === "Guthix rest(4)" ? 1 : 2) * 0.6);

/**
 * Expected GP per hour = profit/craft * crafts/hour.
 */
export function gpHFor(r, A, G) {
	const profit = profitFor(r, A, G);
	if (profit == null) return null;
	return profit * craftsPerHour(r.name);
}
