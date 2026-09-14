#!/usr/bin/env node
/**
 * Build the final herblore potion recipe list (potions_final.json).
 * Sources: OSRS wiki Herblore page table + Calculator:Herblore/Potions (quantities).
 * Prices: prices.runescape.wiki API (sell high / buy low, 2% GE tax capped 5M).
 */
import fs from "node:fs";

const items = JSON.parse(fs.readFileSync(new URL("./mapping_fresh.json", import.meta.url), "utf8"));
const NAME2ID = new Map(items.map((m) => [m.name, m.id]));

// alias fixes (wiki table name -> GE name)
const ALIAS = {
	"Araxyte venom sack": "Araxyte venom sac",
	"Araxyte venom sac": "Araxyte venom sac",
	"Clean snake weed": "Clean snake weed",
};

function id(name) {
	const n = ALIAS[name] || name;
	return NAME2ID.has(n) ? NAME2ID.get(n) : null;
}

/**
 * recipes: [geName, level, xp, [ [ingredientName, qty], ... ]]
 */
const R = [
	// --- standard potions (vial + herb + secondary) ---
	["Attack potion(4)", 3, 25, [["Vial of water", 1], ["Guam leaf", 1], ["Eye of newt", 1]]],
	["Antipoison(4)", 5, 37.5, [["Vial of water", 1], ["Marrentill", 1], ["Unicorn horn dust", 1]]],
	["Strength potion(4)", 12, 50, [["Vial of water", 1], ["Tarromin", 1], ["Limpwurt root", 1]]],
	["Serum 207 (4)", 15, 50, [["Vial of water", 1], ["Tarromin", 1], ["Ashes", 1]]],
	["Guthix rest(4)", 18, 59, [["Cup of hot water", 1], ["Harralander", 1], ["Marrentill", 1]]],
	["Compost potion(4)", 22, 60, [["Vial of water", 1], ["Harralander", 1], ["Volcanic ash", 1]]],
	["Restore potion(4)", 22, 62.5, [["Vial of water", 1], ["Harralander", 1], ["Red spiders' eggs", 1]]],
	["Guthix balance(4)", 22, 50, [["Restore potion(4)", 1], ["Garlic", 1], ["Silver dust", 1]]],
	["Energy potion(4)", 26, 67.5, [["Vial of water", 1], ["Harralander", 1], ["Chocolate dust", 1]]],
	["Defence potion(4)", 30, 75, [["Vial of water", 1], ["Ranarr weed", 1], ["White berries", 1]]],
	["Agility potion(4)", 34, 80, [["Vial of water", 1], ["Toadflax", 1], ["Toad's legs", 1]]],
	["Combat potion(4)", 36, 84, [["Vial of water", 1], ["Harralander", 1], ["Goat horn dust", 1]]],
	["Prayer potion(4)", 38, 87.5, [["Vial of water", 1], ["Ranarr weed", 1], ["Snape grass", 1]]],
	["Super attack(4)", 45, 100, [["Vial of water", 1], ["Irit leaf", 1], ["Eye of newt", 1]]],
	["Superantipoison(4)", 48, 106.25, [["Vial of water", 1], ["Irit leaf", 1], ["Unicorn horn dust", 1]]],
	["Fishing potion(4)", 50, 112.5, [["Vial of water", 1], ["Avantoe", 1], ["Snape grass", 1]]],
	["Super energy(4)", 52, 117.5, [["Vial of water", 1], ["Avantoe", 1], ["Mort myre fungus", 1]]],
	["Hunter potion(4)", 53, 120, [["Vial of water", 1], ["Avantoe", 1], ["Kebbit teeth dust", 1]]],
	["Goading potion(4)", 54, 132, [["Vial of water", 1], ["Harralander", 1], ["Aldarium", 1]]],
	["Super strength(4)", 55, 125, [["Vial of water", 1], ["Kwuarm", 1], ["Limpwurt root", 1]]],
	["Haemostatic poultice", 56, 27, [["Vial of water", 1], ["Elkhorn coral", 1], ["Squid paste", 1]]],
	["Haemostatic dressing (4)", 56, 100, [["Haemostatic poultice", 1], ["Cotton yarn", 1]]],
	["Prayer regeneration potion(4)", 58, 132, [["Vial of water", 1], ["Huasca", 1], ["Aldarium", 1]]],
	["Weapon poison", 60, 137.5, [["Vial of water", 1], ["Kwuarm", 1], ["Dragon scale dust", 1]]],
	["Super fishing potion(4)", 62, 140.5, [["Vial of water", 1], ["Pillar coral", 1], ["Haddock eye", 1]]],
	["Super restore(4)", 63, 142.5, [["Vial of water", 1], ["Snapdragon", 1], ["Red spiders' eggs", 1]]],
	["Sanfew serum(4)", 65, 160, [["Super restore(4)", 1], ["Unicorn horn dust", 1], ["Clean snake weed", 1], ["Nail beast nails", 1]]],
	["Extreme energy potion(4)", 66, 84, [["Super energy(4)", 1], ["Yellow fin", 4]]],
	["Super defence(4)", 66, 150, [["Vial of water", 1], ["Cadantine", 1], ["White berries", 1]]],
	["Super hunter potion(4)", 67, 154, [["Vial of water", 1], ["Pillar coral", 1], ["Crab paste", 1]]],
	["Antidote+(4)", 68, 155, [["Coconut milk", 1], ["Toadflax", 1], ["Yew roots", 1]]],
	["Antifire potion(4)", 69, 157.5, [["Vial of water", 1], ["Lantadyme", 1], ["Dragon scale dust", 1]]],
	["Ranging potion(4)", 72, 162.5, [["Vial of water", 1], ["Dwarf weed", 1], ["Wine of Zamorak", 1]]],
	["Weapon poison(+)", 73, 190, [["Coconut milk", 1], ["Cactus spine", 1], ["Red spiders' eggs", 1]]],
	["Magic potion(4)", 76, 172.5, [["Vial of water", 1], ["Lantadyme", 1], ["Potato cactus", 1]]],
	["Stamina potion(4)", 77, 102, [["Super energy(4)", 1], ["Amylase crystal", 4]]],
	["Zamorak brew(4)", 78, 175, [["Vial of water", 1], ["Torstol", 1], ["Jangerberries", 1]]],
	["Antidote++(4)", 79, 177.5, [["Coconut milk", 1], ["Irit leaf", 1], ["Magic roots", 1]]],
	["Bastion potion(4)", 80, 155, [["Vial of blood", 1], ["Cadantine", 1], ["Wine of Zamorak", 1]]],
	["Battlemage potion(4)", 80, 155, [["Vial of blood", 1], ["Cadantine", 1], ["Potato cactus", 1]]],
	["Saradomin brew(4)", 81, 180, [["Vial of water", 1], ["Toadflax", 1], ["Crushed nest", 1]]],
	["Surge potion(4)", 81, 185, [["Vial of water", 1], ["Torstol", 1], ["Demonic tallow", 1]]],
	["Extended antifire(4)", 84, 110, [["Antifire potion(4)", 1], ["Lava scale shard", 4]]],
	["Ancient brew(4)", 85, 190, [["Vial of water", 1], ["Dwarf weed", 1], ["Nihil dust", 1]]],
	["Extended stamina potion(4)", 85, 110, [["Stamina potion(4)", 1], ["Marlin scales", 4]]],
	["Anti-venom(4)", 87, 120, [["Antidote++(4)", 1], ["Zulrah's scales", 20]]],
	["Menaphite remedy(4)", 88, 200, [["Vial of water", 1], ["Dwarf weed", 1], ["Lily of the Sands", 1]]],
	["Armadyl brew(4)", 89, 205, [["Vial of water", 1], ["Umbral coral", 1], ["Rainbow crab paste", 1]]],
	["Super combat potion(4)", 90, 150, [["Super attack(4)", 1], ["Super strength(4)", 1], ["Super defence(4)", 1], ["Torstol", 1]]],
	["Forgotten brew(4)", 91, 145, [["Ancient brew(4)", 1], ["Ancient essence", 80]]],
	["Super antifire potion(4)", 92, 130, [["Antifire potion(4)", 1], ["Crushed superior dragon bones", 1]]],
	["Anti-venom+(4)", 94, 125, [["Anti-venom(4)", 1], ["Torstol", 1]]],
	["Extended anti-venom+(4)", 94, 80, [["Anti-venom+(4)", 1], ["Araxyte venom sac", 4]]],
	// two valid recipes; the cheaper one wins at runtime
	["Extended super antifire(4)", 98, 160, [["Super antifire potion(4)", 1], ["Lava scale shard", 4]]],
];

// also the alternate extended super antifire recipe (extended antifire + 1 crushed bone)
const ALT_RECIPES = {
	"Extended super antifire(4)": [["Extended antifire(4)", 1], ["Crushed superior dragon bones", 1]],
};

const out = [];
const problems = [];
for (const [name, level, xp, ings] of R) {
	const potionId = id(name);
	if (!potionId) problems.push(`potion not in price API: ${name}`);
	const ingredients = ings.map(([n, q]) => {
		const iid = id(n);
		if (!iid) problems.push(`ingredient not in price API: ${n} (for ${name})`);
		return { name: n, qty: q, id: iid };
	});
	out.push({
		name,
		id: potionId,
		level,
		xp,
		ingredients,
		altRecipes: (ALT_RECIPES[name] || []).map(([n, q]) => ({ name: n, qty: q, id: id(n) })),
		pricable: potionId !== null && ingredients.every((i) => i.id !== null),
	});
}

console.log("potions:", out.length, "| pricable:", out.filter((p) => p.pricable).length);
if (problems.length) {
	console.log("\nproblems:");
	for (const p of problems) console.log(" -", p);
}
fs.writeFileSync(new URL("./potions_final.json", import.meta.url), JSON.stringify(out, null, 2));
console.log("\nwrote potions_final.json");
