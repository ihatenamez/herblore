#!/usr/bin/env node
import fs from "node:fs";

const t = fs.readFileSync("/tmp/calc_potions_table.html", "utf8");
const rowBodies = t.split(/<tr[^>]*>/).slice(2); // skip header

const rows = [];
for (const r of rowBodies) {
	const cells = r.split(/<\/td>/).map((c) => c.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
	if (cells.length < 7) continue;
	rows.push({
		potion: cells[0],
		level: Number(cells[1]),
		xp: Number(cells[2]),
		base: cells[3],
		baseCost: cells[4],
		secondary: cells[5],
		secCost: cells[6],
		potionCost: cells[7],
	});
}
console.log("rows:", rows.length);
for (const r of rows) {
	console.log(
		`${String(r.level).padStart(3)}  ${r.potion.padEnd(38)} base=${r.base.padEnd(26)} sec=${r.secondary}`,
	);
}
fs.writeFileSync(new URL("./calc_rows.json", import.meta.url), JSON.stringify(rows, null, 2));
