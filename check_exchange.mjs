#!/usr/bin/env node
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" };

async function get(url) {
	const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
	return { status: res.status, text: await res.text() };
}

// 1. Exchange pages for the missing items
for (const name of ["Dragon_scale", "Rune_dust", "Overload_(4)", "Dragon_brew_(4)", "Rune_(4)", "Crystal_dust"]) {
	const { status, text } = await get("https://oldschool.runescape.wiki/w/Exchange:" + name);
	if (status !== 200) {
		console.log("Exchange:" + name, "=> HTTP", status);
		continue;
	}
	const title = text.match(/<title>([^<]*)<\/title>/);
	const priceLink = [...new Set([...text.matchAll(/prices\.runescape\.wiki\/osrs\/item\/(\d+)/g)].map((m) => m[1]))];
	console.log("Exchange:" + name, "=>", title?.[1], "| price ids:", priceLink.join(","));
}

// 2. wiki search for dragon brew
const { status, text } = await get("https://oldschool.runescape.wiki/w/index.php?search=dragon+brew+potion&title=Special%3ASearch&fulltext=1");
console.log("\nsearch status:", status);
const results = [...text.matchAll(/<a[^>]+href="\/w\/([^"]+)"[^>]*class="[^"]*search-result[^"]*"[^>]*>([^<]*)/g)].map((m) => m[1] + " :: " + m[2]);
if (results.length === 0) {
	// fallback: any /w/ links with "brew" in them
	const links = [...new Set([...text.matchAll(/href="\/w\/([^\"]*[Bb]rew[^\"]*)"/g)].map((m) => m[1]))];
	console.log("brew links:", links.slice(0, 20).join(" | "));
} else {
	console.log(results.slice(0, 20).join("\n"));
}
