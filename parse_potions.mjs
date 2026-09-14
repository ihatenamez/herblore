#!/usr/bin/env node
/**
 * Parse the OSRS wiki Herblore potion table (markdown from r.jina.ai) into
 * a JSON recipe list: /workspace/osrs/herblore_live/potions.json
 */
import fs from "node:fs";

const md = fs.readFileSync("/tmp/herblore_table.md", "utf8");
const lines = md.split("\n").filter((l) => l.trimStart().startsWith("|"));

function cellText(cell) {
	// strip markdown images
	const noImg = cell.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
	// take link title if present (last "](... \"Title\")"), else plain text
	const links = [...noImg.matchAll(/\]\([^)]*?"([^"]+)"\)/g)];
	if (links.length) return links[links.length - 1][1].trim();
	return noImg.replace(/\s+/g, " ").trim();
}

function cellImageName(cell) {
	const m = cell.match(/!\[[^\]]*\]\([^)]*?\/images\/([^)\?]+)/);
	if (!m) return null;
	return decodeURIComponent(m[1]).replace(/\.png$/i, "");
}

const potions = [];
for (const line of lines) {
	const cells = line.split("|").map((c) => c.trim());
	// drop leading/trailing empties from the border pipes
	while (cells.length && cells[0] === "") cells.shift();
	while (cells.length && cells[cells.length - 1] === "") cells.pop();
	if (cells.length < 8) continue;

	const level = Number(cells[0]);
	if (!Number.isFinite(level)) continue; // header/separator rows

	// layout: level | potionIcon | potionName | xp | baseIcon | baseName | primaryIcon | primaryName | [secIcon | secName] | notes
	const potionGeName = cellImageName(cells[1]) || cellText(cells[2]);
	const xpCell = cells[3];
	const xp = Number(xpCell.match(/^([\d.]+)/)?.[1]);

	// find the base/primary/secondary names: text cells after xp
	// text cells in order: baseName, primaryName, secName?, notes...
	const rest = cells.slice(4);
	const names = [];
	for (const c of rest) {
		if (c.includes("![")) continue; // icon cell
		names.push(cellText(c));
	}
	// names = [baseName, primaryName, secName?, ...notes]
	const baseName = names[0];
	const primaryName = names[1];
	let secondaryName = null;
	if (names.length >= 3 && names[2] !== "N/A" && names[2].length < 40) {
		secondaryName = names[2];
	}

	// skip non-standard rows: level 180 (crushed bone variants) and imp repellent (flowers)
	if (level >= 100 && level < 200 && !Number.isFinite(xp)) continue;
	if (level === 180) continue;

	potions.push({
		name: potionGeName,
		level,
		xp: Number.isFinite(xp) ? xp : null,
		base: baseName,
		primary: primaryName,
		secondary: secondaryName,
	});
}

// de-duplicate by name (keep first)
const seen = new Set();
const unique = potions.filter((p) => (seen.has(p.name) ? false : (seen.add(p.name), true)));

console.log("parsed:", unique.length, "potions");
for (const p of unique) {
	console.log(
		`${String(p.level).padStart(3)}  ${p.name.padEnd(38)} xp=${String(p.xp).padEnd(6)} ${p.base} + ${p.primary}${p.secondary ? " + " + p.secondary : ""}`,
	);
}
fs.writeFileSync(new URL("./potions.json", import.meta.url), JSON.stringify(unique, null, 2));
console.log("\nwrote", new URL("./potions.json", import.meta.url).pathname);
