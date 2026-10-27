// Extract user turns from pi session files: node bench/turns.ts
import { readFileSync, writeFileSync, globSync } from "node:fs";
import { homedir } from "node:os";
import { basename } from "node:path";

export interface Turn {
	id: string;
	prompt: string;
	previous?: string;
	kind: "opener" | "follow-up";
	source: "session" | "handwritten";
}

interface Entry {
	id: string;
	parentId: string | null;
	role: string;
	text: string;
}

function textOf(content: unknown): string {
	if (typeof content === "string") return content.trim();
	if (!Array.isArray(content)) return "";
	return content
		.filter((b) => b?.type === "text" && typeof b.text === "string")
		.map((b) => b.text)
		.join("\n")
		.trim();
}

export function extractTurns(jsonl: string, fileId: string): Turn[] {
	const byId = new Map<string, Entry>();
	const order: Entry[] = [];
	for (const line of jsonl.split("\n")) {
		let e: any;
		try {
			e = JSON.parse(line);
		} catch {
			continue;
		}
		if (typeof e?.id !== "string") continue;
		// Non-message entries (compaction, model_change, custom, …) sit in the same parentId tree; keep them as links.
		const isMessage = e.type === "message" && e.message?.role;
		const entry = { id: e.id, parentId: e.parentId ?? null, role: isMessage ? e.message.role : "", text: isMessage ? textOf(e.message.content) : "" };
		byId.set(entry.id, entry);
		order.push(entry);
	}
	const turns: Turn[] = [];
	for (const entry of order) {
		if (entry.role !== "user" || !entry.text) continue;
		let sawAssistant = false;
		let previous: string | undefined;
		for (let p = entry.parentId ? byId.get(entry.parentId) : undefined; p; p = p.parentId ? byId.get(p.parentId) : undefined) {
			if (p.role !== "assistant") continue;
			sawAssistant = true;
			if (p.text) {
				previous = p.text;
				break;
			}
		}
		turns.push({
			id: `${fileId}#${entry.id}`,
			prompt: entry.text,
			...(previous ? { previous } : {}),
			kind: sawAssistant ? "follow-up" : "opener",
			source: "session",
		});
	}
	return turns;
}

if (import.meta.main) {
	const files = globSync(`${homedir()}/.pi/agent/sessions/**/*.jsonl`);
	const seen = new Set<string>();
	const all: Turn[] = [];
	for (const file of files) {
		for (const turn of extractTurns(readFileSync(file, "utf8"), basename(file))) {
			if (seen.has(turn.prompt)) continue;
			seen.add(turn.prompt);
			all.push(turn);
		}
	}
	writeFileSync("data/turns.jsonl", all.map((t) => JSON.stringify(t)).join("\n") + "\n");
	const count = (k: Turn["kind"]) => all.filter((t) => t.kind === k).length;
	console.log(`${files.length} sessions → ${all.length} turns (${count("opener")} openers, ${count("follow-up")} follow-ups)`);
}
