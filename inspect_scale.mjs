#!/usr/bin/env node
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" };

const res = await fetch("https://oldschool.runescape.wiki/w/Dragon_scale", { headers: UA, signal: AbortSignal.timeout(30000) });
const t = await res.text();
console.log("status:", res.status, "len:", t.length);

// find the real-time prices widget / item id references
const idx = t.indexOf("prices.runescape.wiki");
console.log("--- around price link:");
console.log(t.slice(idx - 600, idx + 300).replace(/\s+/g, " "));

// look for item id in infobox (data-item-id or similar)
for (const pat of [/data-item-id="(\d+)"/, /item_id["'\s:=]+(\d+)/, /"itemId":(\d+)/, /item\/(\d+)/g]) {
	const m = t.match(pat);
	if (m) console.log("pattern", pat, "=>", m[1] || m[0]);
}
