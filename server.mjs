#!/usr/bin/env node
/**
 * Localhost website for the herblore top-8 project.
 *
 *   http://127.0.0.1:8042/               -> live dashboard (web/index.html)
 *   http://127.0.0.1:8042/api/state      -> JSON state (potions, prices, meta)
 *   http://127.0.0.1:8042/herblore_top8.xlsx -> current workbook download
 *
 * Also runs the price-update cycle every 5 minutes (same as run_live.mjs),
 * so ONE process keeps everything fresh.
 *
 * Usage: node server.mjs [port]   (default 8042, or env PORT)
 */
import http from "node:http";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { buildRow, profitFor, tax } from "./model.mjs";

const HERE = new URL(".", import.meta.url);
const PORT = Number(process.argv[2] || process.env.PORT || 8042);
const INTERVAL = 5 * 60 * 1000; // price update every 5 min

// ---------- static recipe data ----------
const POTIONS = JSON.parse(fs.readFileSync(new URL("./potions_final.json", HERE), "utf8"));
const IMAGES = JSON.parse(fs.readFileSync(new URL("./images.json", HERE), "utf8")); // name -> file

// name -> id for every pricable item (potions + (2)-dose versions + ingredients + alts)
const ITEMS = new Map();
for (const p of POTIONS) {
	if (p.id != null) ITEMS.set(p.name, p.id);
	if (p.id2 != null) ITEMS.set(p.name.replace(/\(4\)$/, "") + "(2)", p.id2); // (2)-dose version
	for (const ing of p.ingredients) if (ing.id != null) ITEMS.set(ing.name, ing.id);
	for (const ing of p.altRecipes || []) if (ing.id != null) ITEMS.set(ing.name, ing.id);
}

// ---------- profit model (shared with gen_workbook.mjs via model.mjs) ----------
// One craft = 3 doses; amulet 15% -> 4; goggles 10% save the secondary.
// See model.mjs for the full wiki-verified mechanics.
function computeRows(prices) {
	return POTIONS.map((p) => {
		const r = buildRow(p, prices, IMAGES);
		return {
			...r,
			cost: r.craftCost, // cost of the craft actually performed
			secCost: r.craftSec,
			secName: r.secondaries.join(", "),
			profit: profitFor(r, 1, 1), // default: both equipment on (web page re-computes per toggle)
		};
	});
}

function stateJson() {
	const prices = JSON.parse(fs.readFileSync(new URL("./prices_live.json", HERE), "utf8"));
	let lastUpdate = 0;
	let source = "";
	for (const d of Object.values(prices)) {
		if (d.updated > lastUpdate) lastUpdate = d.updated;
	}
	for (const d of Object.values(prices)) if (d.updated === lastUpdate && d.source) source = d.source;
	const priceList = {};
	for (const [name, id] of ITEMS) {
		const d = prices[id];
		if (!d) continue;
		priceList[name] = {
			img: IMAGES[name] ?? null,
			buy: d.low ?? null,
			sell: d.high != null ? tax(d.high) : null,
			updated: d.updated ? new Date(d.updated).toISOString() : null,
		};
	}
	let xlsxMtime = null;
	try {
		xlsxMtime = fs.statSync(new URL("./herblore_top8.xlsx", HERE)).mtime.toISOString();
	} catch {}
	return {
		generatedAt: new Date().toISOString(),
		lastPriceUpdate: lastUpdate ? new Date(lastUpdate).toISOString() : null,
		source,
		xlsxMtime,
		potions: computeRows(prices),
		prices: priceList,
	};
}

// ---------- price update loop (same as run_live.mjs) ----------
let updating = false;
function runCycle() {
	if (updating) return;
	updating = true;
	const child = spawn(process.execPath, [new URL("./update_prices.mjs", HERE).pathname], {
		stdio: ["ignore", "pipe", "pipe"],
	});
	let out = "";
	child.stdout.on("data", (d) => (out += d));
	child.stderr.on("data", (d) => (out += d));
	child.on("close", () => {
		updating = false;
		console.log(`[update ${new Date().toISOString()}] exit ${child.exitCode}`);
		const tail = out.trim().split("\n").slice(-3).join(" | ");
		if (tail) console.log("    " + tail);
	});
}

// ---------- http server ----------
const INDEX = () => fs.readFileSync(new URL("./web/index.html", HERE));

const server = http.createServer((req, res) => {
	const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
	try {
		if (url.pathname === "/" || url.pathname === "/index.html") {
			res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
			res.end(INDEX());
		} else if (url.pathname === "/api/state") {
			res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
			res.end(JSON.stringify(stateJson()));
		} else if (url.pathname.startsWith("/img/")) {
			const file = decodeURIComponent(url.pathname.slice(5));
			// only serve files that exist in web/img (no path traversal)
			if (!file || file.includes("/") || file.includes("..")) {
				res.writeHead(400, { "Content-Type": "text/plain" });
				res.end("bad path");
				return;
			}
			try {
				const buf = fs.readFileSync(new URL(`./web/img/${file}`, HERE));
				res.writeHead(200, {
					"Content-Type": "image/png",
					"Content-Length": buf.length,
					"Cache-Control": "public, max-age=86400",
				});
				res.end(buf);
			} catch {
				res.writeHead(404, { "Content-Type": "text/plain" });
				res.end("not found");
			}
		} else if (url.pathname === "/herblore_top8.xlsx") {
			const buf = fs.readFileSync(new URL("./herblore_top8.xlsx", HERE));
			res.writeHead(200, {
				"Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
				"Content-Disposition": 'attachment; filename="herblore_top8.xlsx"',
				"Content-Length": buf.length,
			});
			res.end(buf);
		} else if (url.pathname === "/api/health") {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ ok: true, updating }));
		} else {
			res.writeHead(404, { "Content-Type": "text/plain" });
			res.end("not found");
		}
	} catch (e) {
		res.writeHead(500, { "Content-Type": "text/plain" });
		res.end("server error: " + e.message);
	}
});

server.listen(PORT, "127.0.0.1", () => {
	console.log(`herblore dashboard: http://127.0.0.1:${PORT}/`);
	console.log(`price update cycle: every ${INTERVAL / 60000} min (first run starting now)`);
	runCycle();
	setInterval(runCycle, INTERVAL);
});
