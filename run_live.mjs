#!/usr/bin/env node
/**
 * Live update loop: refresh GE prices + regenerate herblore_top8.xlsx
 * every INTERVAL ms (default 5 minutes; user asked for 5–10 min).
 *
 * Run:  node run_live.mjs [intervalMs]
 *       nohup node run_live.mjs 300000 >> live_loop.log 2>&1 &
 *
 * Each cycle logs to update_log.jsonl; the previous workbook is kept in
 * history/ (last 20) so a bad regeneration can be rolled back.
 */
import { execFileSync } from "node:child_process";

const INTERVAL = Number(process.argv[2] || 5 * 60 * 1000);
console.log(`herblore top-8 live loop: updating every ${INTERVAL / 1000}s (pid ${process.pid})`);

while (true) {
	const t0 = Date.now();
	try {
		execFileSync(process.execPath, [new URL("./update_prices.mjs", import.meta.url).pathname], {
			stdio: "inherit",
			timeout: INTERVAL,
		});
	} catch (e) {
		console.error("cycle error:", e.message);
	}
	const elapsed = Date.now() - t0;
	const wait = Math.max(1000, INTERVAL - elapsed);
	await new Promise((r) => setTimeout(r, wait));
}
