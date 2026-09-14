#!/usr/bin/env node
/**
 * One update cycle:
 *  1. Try the OSRS price API (buy=low / sell=high) via the Jina reader
 *     (direct API is Cloudflare-403 from this machine).
 *  2. Fallback: the OSRS wiki's Module:GEPrices/data.json (median price;
 *     used as both buy and sell, with the 2% GE tax applied to sell by the
 *     workbook — same method as the wiki's own GEP template).
 *  3. Merge into prices_live.json, back up the current xlsx, regenerate it,
 *     append to update_log.jsonl.
 *
 * On total failure the previous prices are kept and the failure is logged —
 * the spreadsheet simply stays on its last values.
 */
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const HERE = new URL(".", import.meta.url);
const POTIONS = JSON.parse(fs.readFileSync(new URL("./potions_final.json", HERE), "utf8"));
const XLSX_PATH = new URL("./herblore_top8.xlsx", HERE);
const HISTORY_DIR = new URL("./history/", HERE);
const LOG_PATH = new URL("./update_log.jsonl", HERE);
const UA = { "User-Agent": "Mozilla/5.0 (herblore-top8/1.0; price updater)" };

// needed items: potions + all ingredients (main + alt recipes)
const ITEMS = new Map(); // name -> id
for (const p of POTIONS) {
	if (p.id != null) ITEMS.set(p.name, p.id);
	if (p.id2 != null) ITEMS.set(p.name.replace(/\(4\)$/, "") + "(2)", p.id2); // (2)-dose version, for the combining model
	for (const ing of p.ingredients) if (ing.id != null) ITEMS.set(ing.name, ing.id);
	for (const ing of p.altRecipes || []) if (ing.id != null) ITEMS.set(ing.name, ing.id);
}
const ID_LIST = [...new Set(ITEMS.values())].sort((a, b) => a - b);
console.log(`needed items: ${ITEMS.size} (${ID_LIST.length} unique ids)`);

// ---------- source A: price API via Jina (low + high) ----------
async function fetchPriceApi() {
	const url =
		"https://r.jina.ai/https://prices.runescape.wiki/api/v1/summary?ids=" + ID_LIST.join(",");
	const res = await fetch(url, { headers: { ...UA, "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(120_000) });
	const t = await res.text();
	if (/browser check|fight bots|Just a moment|CAPTCHA/i.test(t))
		throw new Error("jina/price-api blocked (browser check or CF challenge)");
	const i = t.indexOf("Markdown Content:");
	const j = JSON.parse((i >= 0 ? t.slice(i + "Markdown Content:".length) : t).trim());
	const out = new Map(); // id -> {low, high}
	if (Array.isArray(j)) for (const e of j) if (e?.id != null) out.set(Number(e.id), e);
	else for (const [id, e] of Object.entries(j)) if (e?.high != null) out.set(Number(id), e);
	return out;
}

// ---------- source B: wiki GEPrices data module (median) ----------
async function fetchWikiMedian() {
	const res = await fetch(
		"https://oldschool.runescape.wiki/api.php?action=parse&page=Module:GEPrices/data.json&prop=wikitext&format=json",
		{ headers: UA, signal: AbortSignal.timeout(60_000) },
	);
	if (!res.ok) throw new Error("wiki api status " + res.status);
	const j = await res.json();
	const data = JSON.parse(j.parse.wikitext["*"]);
	const out = new Map(); // name -> median
	for (const [name, v] of Object.entries(data)) if (typeof v === "number") out.set(name, v);
	return out;
}

function log(entry) {
	fs.appendFileSync(LOG_PATH, JSON.stringify({ time: new Date().toISOString(), ...entry }) + "\n");
}

const prev = JSON.parse(fs.readFileSync(new URL("./prices_live.json", HERE), "utf8"));
let source, prices; // prices: Map id -> {low, high}
try {
	prices = await fetchPriceApi();
	source = "price-api";
} catch (eA) {
	try {
		const medians = await fetchWikiMedian();
		prices = new Map();
		for (const [name, id] of ITEMS) {
			const m = medians.get(name);
			if (m != null) prices.set(id, { low: m, high: m });
		}
		source = "wiki-median";
		console.log(`price API failed (${eA.message}); using wiki median prices`);
	} catch (eB) {
		console.error("BOTH SOURCES FAILED:", eA.message, "|", eB.message, "— keeping previous prices");
		log({ ok: false, error: `${eA.message} | ${eB.message}` });
		process.exit(0);
	}
}

// merge + sanity check
const next = { ...prev };
let nUpdated = 0, nMissing = 0;
const sanity = [];
for (const id of ID_LIST) {
	const d = prices.get(id);
	if (!d) {
		nMissing++;
		continue;
	}
	const old = prev[String(id)];
	if (old && old.high > 0 && (d.high > old.high * 5 || d.high < old.high / 5))
		sanity.push({ id, old: old.high, now: d.high });
	next[String(id)] = { low: d.low, high: d.high, updated: Date.now(), source };
	nUpdated++;
}
console.log(`source: ${source} | updated: ${nUpdated}, missing: ${nMissing}`);
if (sanity.length) {
	console.warn("sanity warnings (price moved >5x vs last cycle — kept, but check):");
	for (const s of sanity) console.warn("  ", s);
}
if (nUpdated === 0) {
	console.error("no prices updated — keeping previous file");
	log({ ok: false, error: "empty response" });
	process.exit(0);
}
fs.writeFileSync(new URL("./prices_live.json", HERE), JSON.stringify(next));

// back up current xlsx (keep last 20)
if (fs.existsSync(XLSX_PATH)) {
	fs.mkdirSync(HISTORY_DIR, { recursive: true });
	const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15).replace("T", "_");
	fs.copyFileSync(XLSX_PATH, new URL(`./history/herblore_top8_${stamp}.xlsx`, HERE));
	const old = fs.readdirSync(HISTORY_DIR).filter((f) => f.endsWith(".xlsx")).sort();
	while (old.length > 20) fs.rmSync(new URL(`./history/${old.shift()}`, HERE));
}

// regenerate workbook
execFileSync(process.execPath, [new URL("./gen_workbook.mjs", HERE).pathname], { stdio: "inherit" });
log({ ok: true, source, updated: nUpdated, missing: nMissing });
console.log("cycle complete");
