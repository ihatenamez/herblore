#!/usr/bin/env node
// Fetch fresh item list from OSRS price API via Jina reader, save to items_fresh.json
import fs from "node:fs";

const res = await fetch("https://r.jina.ai/https://prices.runescape.wiki/api/v2/osrs/items", {
	headers: { "User-Agent": "Mozilla/5.0" },
	signal: AbortSignal.timeout(120000),
});
const t = await res.text();
console.log("status:", res.status, "| len:", t.length);
const i = t.indexOf("Markdown Content:");
const json = t.slice(i + "Markdown Content:".length).trim();
const items = JSON.parse(json);
console.log("items:", items.length);

const NAME2ID = new Map(items.map((m) => [m.name, m.id]));
const check = [
	"Dragon scale", "Overload(4)", "Dragon brew(4)", "Rune(4)", "Crystal dust",
	"Imp repellent", "Imp repellant", "Lava scale shard", "Araxyte venom sac",
	"Umbral coral", "Rainbow crab paste", "Lily of the Sands", "Crushed superior dragon bones",
	"Wine of Zamorak", "Nihil dust", "Demonic tallow", "Rogue's purse", "Snake weed",
	"Anchovy oil", "Blamish snail slime", "Pharmakos berries", "Star flower", "Gorak claw powder",
	"Nightshade", "Cactus spine", "Poison ivy berries", "Aldarium", "Huasca", "Shrunk ogleroot",
	"Kebbit teeth dust", "Volcanic ash", "Red spiders' eggs", "White berries", "Toad's legs",
	"Chocolate dust", "Goat horn dust", "Unicorn horn dust", "Limpwurt root", "Haddock eye",
	"Crab paste", "Elkhorn coral", "Squid paste", "Cotton yarn", "Yellow fin", "Crushed nest",
	"Zulrah's scales", "Marlin scales", "Lava scale", "Dragon scale (hide)",
];
for (const n of check) console.log(n, "=>", NAME2ID.has(n) ? NAME2ID.get(n) : "NOT FOUND");

fs.writeFileSync(new URL("./items_fresh.json", import.meta.url), JSON.stringify(items, null, 0));
console.log("wrote items_fresh.json");
