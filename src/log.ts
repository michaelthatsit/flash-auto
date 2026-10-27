import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/** Append one JSON line; logging must never affect routing, so every error is swallowed. */
export function appendDecision(file: string, entry: object): void {
	try {
		// Non-recursive on purpose: recursive mkdirSync can loop forever on some paths (e.g. under /proc).
		if (!existsSync(dirname(file))) mkdirSync(dirname(file));
		appendFileSync(file, JSON.stringify(entry) + "\n");
	} catch {
		// ignore
	}
}
