// Label sheet: node bench/labels.ts build  (data/labels.md → data/testset.jsonl)
import { readFileSync, writeFileSync } from "node:fs";
import { LEVELS, type Level } from "../src/levels.ts";
import type { Turn } from "./turns.ts";

export interface LabeledItem extends Turn {
	level: Level;
	reason: string;
	split: "dev" | "test";
	handwritten: boolean;
}
type Draft = Omit<LabeledItem, "split">;

const quote = (text: string) => text.split("\n").map((l) => (l ? `> ${l}` : ">")).join("\n");

export function renderLabelSheet(items: Draft[]): string {
	const sections = items.map((it) => {
		const lines = [`## ${it.id} · ${it.kind}${it.handwritten ? " · handwritten" : ""}`, ""];
		if (it.previous) lines.push("**Previous assistant:**", quote(it.previous), "");
		lines.push("**Prompt:**", quote(it.prompt), "", `level: ${it.level}`, `reason: ${it.reason}`);
		return lines.join("\n");
	});
	return `# Reasoning-level labels\n\nEdit any \`level:\` line you disagree with (off | low | medium | xhigh).\n\n${sections.join("\n\n")}\n`;
}

export function parseLabelSheet(md: string): Draft[] {
	return md
		.split(/^## /m)
		.slice(1)
		.map((section) => {
			const [header, ...body] = section.split("\n");
			const [id, kind, flag] = header.split(" · ").map((s) => s.trim());
			const blocks: Record<string, string[]> = {};
			let current: string | undefined;
			let level: string | undefined;
			let reason = "";
			for (const line of body) {
				if (line === "**Previous assistant:**") current = "previous";
				else if (line === "**Prompt:**") current = "prompt";
				else if (line.startsWith(">") && current) (blocks[current] ??= []).push(line.replace(/^> ?/, ""));
				else if (line.startsWith("level:")) level = line.slice(6).trim();
				else if (line.startsWith("reason:")) reason = line.slice(7).trim();
			}
			if (!LEVELS.includes(level as Level)) throw new Error(`${id}: unknown level "${level}"`);
			if (kind !== "opener" && kind !== "follow-up") throw new Error(`${id}: unknown kind "${kind}"`);
			const handwritten = flag === "handwritten";
			return {
				id,
				prompt: (blocks.prompt ?? []).join("\n"),
				...(blocks.previous ? { previous: blocks.previous.join("\n") } : {}),
				kind,
				source: handwritten ? "handwritten" : "session",
				level: level as Level,
				reason,
				handwritten,
			} satisfies Draft;
		});
}

function mulberry32(seed: number): () => number {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Seeded, level-stratified dev/test split: dev gets a proportional share of every level. */
export function assignSplits(items: Draft[], devCount = 15, seed = 42): LabeledItem[] {
	const rand = mulberry32(seed);
	const groups = LEVELS.map((level) => {
		const g = items.filter((it) => it.level === level);
		for (let i = g.length - 1; i > 0; i--) {
			const j = Math.floor(rand() * (i + 1));
			[g[i], g[j]] = [g[j], g[i]];
		}
		const exact = (devCount * g.length) / items.length;
		return { g, quota: Math.floor(exact), frac: exact - Math.floor(exact) };
	});
	// Largest remainder, then guarantee one dev item for every level with ≥3 items.
	let left = devCount - groups.reduce((s, x) => s + x.quota, 0);
	for (const x of [...groups].sort((a, b) => b.frac - a.frac)) if (left > 0 && x.quota < x.g.length) (x.quota++, left--);
	for (const x of groups) {
		if (x.g.length >= 3 && x.quota === 0) {
			const donor = groups.reduce((a, b) => (b.quota > a.quota ? b : a));
			donor.quota--;
			x.quota++;
		}
	}
	const dev = new Set(groups.flatMap((x) => x.g.slice(0, x.quota)));
	return items.map((it) => ({ ...it, split: dev.has(it) ? "dev" : "test" }));
}

if (import.meta.main && process.argv[2] === "build") {
	const items = assignSplits(parseLabelSheet(readFileSync("data/labels.md", "utf8")));
	writeFileSync("data/testset.jsonl", items.map((it) => JSON.stringify(it)).join("\n") + "\n");
	for (const split of ["dev", "test"] as const) {
		const s = items.filter((it) => it.split === split);
		const row = LEVELS.map((l) => `${l}=${s.filter((it) => it.level === l).length}`).join(" ");
		const fu = s.filter((it) => it.kind === "follow-up").length;
		console.log(`${split}: ${s.length} items (${row}; follow-ups=${fu})`);
	}
}
