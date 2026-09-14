#!/usr/bin/env node
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" };

async function get(url) {
	const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
	return { status: res.status, text: await res.text() };
}

// Crystal dust page?
for (const t of ["Crystal_dust", "Divine_super_attack_potion", "Extended_antifire", "Sanfew_serum"]) {
	const { status, text } = await get("https://oldschool.runescape.wiki/w/" + t);
	if (status !== 200) {
		console.log(t, "=> HTTP", status);
		continue;
	}
	const title = text.match(/<title>([^<]*)<\/title>/);
	console.log("\n==", t, "=>", title?.[1]);
	// find recipe mentions: look for "Herblore level" and ingredient names near "made by"
	const i = text.search(/made by|Made by|Herblore level/i);
	if (i > 0) {
		const snippet = text.slice(i - 200, i + 600).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
		console.log("  ctx:", snippet.slice(0, 500));
	}
}
