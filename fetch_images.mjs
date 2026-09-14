#!/usr/bin/env node
/**
 * Download all item icons from the OSRS wiki into web/img/.
 * Naming: item name with spaces -> underscores, .png
 * Exceptions (verified against wiki item pages):
 *   Amylase crystal  -> Amylase_crystal_1.png
 *   Lava scale shard -> Lava_scale_shard_1.png
 *   Zulrah's scales  -> Zulrah's_scales_1.png
 *   Ancient essence  -> Ancient_essence_1.png
 * Writes images.json (item name -> file name) for the server.
 */
import fs from "node:fs";

const HERE = new URL(".", import.meta.url);
const POTIONS = JSON.parse(fs.readFileSync(new URL("./potions_final.json", HERE), "utf8"));

const ITEMS = new Map();
for (const p of POTIONS) {
	if (p.id != null) ITEMS.set(p.name, p.id);
	for (const ing of p.ingredients) if (ing.id != null) ITEMS.set(ing.name, ing.id);
	for (const ing of p.altRecipes || []) if (ing.id != null) ITEMS.set(ing.name, ing.id);
}

const SPECIAL = {
	"Amylase crystal": "Amylase_crystal_1.png",
	"Lava scale shard": "Lava_scale_shard_1.png",
	"Zulrah's scales": "Zulrah's_scales_1.png",
	"Ancient essence": "Ancient_essence_1.png",
};
const fileName = (name) => SPECIAL[name] ?? name.replace(/ /g, "_") + ".png";

fs.mkdirSync(new URL("./web/img/", HERE), { recursive: true });
const mapping = {};
let ok = 0, failed = [];
for (const name of ITEMS.keys()) {
	const file = fileName(name);
	const dest = new URL(`./web/img/${file}`, HERE);
	if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
		mapping[name] = file;
		ok++;
		continue;
	}
	try {
		const r = await fetch("https://oldschool.runescape.wiki/images/" + encodeURIComponent(file), {
			headers: { "User-Agent": "Mozilla/5.0 (herblore-top8/1.0)" },
			signal: AbortSignal.timeout(20000),
		});
		if (!r.ok) throw new Error("HTTP " + r.status);
		const buf = Buffer.from(await r.arrayBuffer());
		if (buf.length < 100 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
		fs.writeFileSync(dest, buf);
		mapping[name] = file;
		ok++;
		console.log(`  ${file} (${buf.length}B)`);
	} catch (e) {
		failed.push(name + " (" + e.message + ")");
	}
	await new Promise((r) => setTimeout(r, 120));
}
fs.writeFileSync(new URL("./images.json", HERE), JSON.stringify(mapping, null, 1));
console.log(`done: ${ok}/${ITEMS.size} images, failed: ${failed.length}`);
if (failed.length) console.log(failed.join("\n"));
