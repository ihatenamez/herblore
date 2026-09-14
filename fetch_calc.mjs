#!/usr/bin/env node
import fs from "node:fs";
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" };

const res = await fetch("https://oldschool.runescape.wiki/w/Calculator:Herblore/Potions", { headers: UA, signal: AbortSignal.timeout(60000) });
console.log("status:", res.status);
const t = await res.text();
fs.writeFileSync("/tmp/calc_potions.html", t);

// find the main table
const h = t.indexOf("Cost (Potion)");
console.log("header idx:", h);
const tableStart = t.lastIndexOf("<table", h);
const tableEnd = t.indexOf("</table>", tableStart);
const table = t.slice(tableStart, tableEnd);
console.log("table len:", table.length);
fs.writeFileSync("/tmp/calc_potions_table.html", table);

// quick row count
const rows = table.match(/<tr/g) || [];
console.log("rows:", rows.length);

// print first 3 data rows as text
const rowBodies = table.split(/<tr[^>]*>/).slice(1, 5);
for (const r of rowBodies) {
	const cells = r.split(/<\/td>/).map((c) => c.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
	console.log("ROW:", cells.join(" || ").slice(0, 400));
}
