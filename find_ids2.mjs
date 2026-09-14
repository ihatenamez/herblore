#!/usr/bin/env node
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" };

async function priceLink(title) {
	try {
		const res = await fetch("https://oldschool.runescape.wiki/w/" + title, { headers: UA, signal: AbortSignal.timeout(30000) });
		if (res.status !== 200) return [title, "HTTP " + res.status];
		const t = await res.text();
		const links = [...new Set([...t.matchAll(/prices\.runescape\.wiki[^"'\s<>]*/g)].map((m) => m[0]))];
		return [title, links.slice(0, 2).join(" || ") || "(none)"];
	} catch (e) {
		return [title, "ERROR " + e.message];
	}
}

const titles = [
	"Dragon_scale",
	"Blue_dragon_scale",
	"Rune_dust",
	"Overload",
	"Dragon_brew",
	"Rune",
	"Super_combat_potion",
	"Crystal_dust",
	"Imp_repellent",
];
for (const t of titles) console.log((await priceLink(t)).join("  =>  "));

// also query price API for ids 243 and a few others
const api = async (id) => {
	const res = await fetch("https://prices.runescape.wiki/api/v2/osrs/latest?id=" + id, {
		headers: { "User-Agent": "herblore-profit-tracker/1.0 (personal use; pi-agent)" },
		signal: AbortSignal.timeout(20000),
	});
	return res.status + " " + (await res.text()).slice(0, 120);
};
console.log("api id=243:", await api(243));
console.log("api id=262:", await api(262));
