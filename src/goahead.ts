/** Short replies that approve what the assistant just proposed; they keep the previous level. */
const GO_AHEAD = new Set([
	"do it", "yes", "yep", "yeah", "y", "go ahead", "go for it", "ok", "okay", "ok do it", "okay do it",
	"sounds good", "proceed", "continue", "ship it", "lgtm", "yes please", "please do", "yes do it", "go",
]);

export function isGoAhead(text: string): boolean {
	if (text.length > 40) return false;
	const norm = text.toLowerCase().replace(/,/g, "").replace(/[\s.!?…]+$/u, "").replace(/\s+/g, " ").trim();
	return GO_AHEAD.has(norm);
}
