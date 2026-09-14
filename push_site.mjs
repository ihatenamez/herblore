#!/usr/bin/env node
/**
 * push_site.mjs — push the freshly updated static site to GitHub (Pages).
 *
 * Called by server.mjs after every successful price-update cycle, so the
 * GitHub Pages site stays fresh every 5 min without relying on the
 * (throttled) GitHub Actions cron.
 *
 * Steps:
 *   1. node build_static.mjs          (rebuild docs/ from prices_live.json + xlsx)
 *   2. git add + commit (only if something changed)
 *   3. git pull --rebase (in case a manual workflow_dispatch ran) + push
 *
 * Auth: token read from ./.token (gitignored) or $GITHUB_TOKEN.
 * Never committed to the repo.
 */
import fs from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";

const HERE = new URL(".", import.meta.url);
const REPO = "https://github.com/ihatenamez/herblore.git";
const LOG = new URL("./push.log", HERE);

function log(line) {
	const l = `[${new Date().toISOString()}] ${line}\n`;
	fs.appendFileSync(LOG, l);
	process.stdout.write(l);
}

function git(...args) {
	return execFileSync("git", args, { cwd: new URL(".", HERE).pathname, encoding: "utf8" }).trim();
}

// ---------- token ----------
let token = process.env.GITHUB_TOKEN || "";
if (!token) {
	try {
		token = fs.readFileSync(new URL("./.token", HERE), "utf8").trim();
	} catch {
		log("no token (./.token or GITHUB_TOKEN) — skipping push");
		process.exit(0);
	}
}
const authUrl = token
	? REPO.replace("https://", `https://x-access-token:${token}@`)
	: REPO;

// ---------- 1. rebuild static site ----------
const build = spawnSync(process.execPath, [new URL("./build_static.mjs", HERE).pathname], {
	encoding: "utf8",
});
if (build.status !== 0) {
	log(`build_static failed: ${build.stderr || build.stdout}`);
	process.exit(0); // don't kill the cycle; retry next round
}

// ---------- 2. commit ----------
git("add", "prices_live.json", "herblore_top8.xlsx", "docs/");
const staged = git("diff", "--cached", "--name-only");
if (!staged) {
	log("no changes — nothing to push");
	process.exit(0);
}
git(
	"-c", "user.name=herblore-updater",
	"-c", "user.email=herblore-updater@users.noreply.github.com",
	"commit", "-m", `prices: ${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC`,
);
log("committed: " + staged.split("\n").join(", "));

// ---------- 3. rebase onto remote (manual dispatch may have committed) + push ----------
try {
	git("pull", "--rebase", "-X", "theirs", authUrl, "main");
} catch (e) {
	git("rebase", "--abort");
	log("rebase failed, will retry next cycle: " + String(e.message).split("\n")[0]);
	process.exit(0);
}
try {
	git("push", authUrl, "main");
	log("pushed to GitHub");
} catch (e) {
	log("push failed: " + String(e.message).split("\n")[0]);
	process.exit(0);
}
