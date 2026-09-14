#!/usr/bin/env node
// Find price-API item IDs from OSRS wiki item pages
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" };

const titles = [
	"Dragon_scale",
	"Overload_(Nightmare_Zone)",
	"Rune_(potion)",
	"Dragon_brew",
	"Rune_dust",
	"Imp_repellent",
	"Crystal_dust",
];

for (const title of titles) {
	try {
		const res = await fetch("https://osrs.wiki/w/" + title, { headers: UA, signal: AbortSignal.timeout(30000) });
		if (res.status !== 200) {
			console.log(title, "=> HTTP", res.status);
			continue;
		}
		const t = await res.text();
		const links = [...new Set([...t.matchAll(/prices\.runescape\.wiki[^"'\s<>]*/g)].map((m) => m[0]))];
		// also try item id in page (data attributes / infobox)
		const idMatch = t.match(/item[_-]?id["'\s:=]+(\d+)/i);
		console.log(title, "=>", links.slice(0, 3).join("  ||  ") || "(no price links)", idMatch ? "| pageid: " + idMatch[1] : "");
	} catch (e) {
		console.log(title, "=> ERROR:", e.message);
	}
}
