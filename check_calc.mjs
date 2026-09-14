#!/usr/bin/env node
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" };

async function get(url) {
	const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
	return { status: res.status, text: await res.text() };
}

for (const t of ["Calculator:Herblore", "Calculator:Herblore/Herbs", "Calculator:Herblore/Potions"]) {
	const { status, text } = await get("https://oldschool.runescape.wiki/w/" + encodeURIComponent(t).replace(/%3A/g, ":"));
	console.log("==", t, "=>", status, "len:", text.length);
	if (status === 200) {
		const title = text.match(/<title>([^<]*)<\/title>/);
		console.log("   title:", title?.[1]);
		// look for table headers
		const ths = [...text.matchAll(/<th[^>]*>([^<]{2,40})<\/th>/g)].map((m) => m[1].trim());
		console.log("   headers:", [...new Set(ths)].slice(0, 20).join(" | "));
	}
}
