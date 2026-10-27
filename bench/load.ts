// Background load on flash: back-to-back streaming generations until stopped.
import type { FlashOptions } from "../src/flash.ts";

export interface LoadHandle {
	isActive(): boolean;
	stop(): Promise<void>;
}

const ESSAY = "Write a very long, detailed technical essay about distributed databases.";

export function startLoad(opts: FlashOptions = {}): LoadHandle {
	const baseUrl = opts.baseUrl ?? "http://localhost:9000";
	const model = opts.model ?? "qwen3.8-flash-next";
	const controller = new AbortController();
	let lastTokenAt = 0;
	let open = false;
	const loop = (async () => {
		while (!controller.signal.aborted) {
			try {
				const res = await (opts.fetch ?? fetch)(`${baseUrl}/v1/chat/completions`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						model,
						messages: [{ role: "user", content: ESSAY }],
						max_tokens: 4000,
						stream: true,
						chat_template_kwargs: { enable_thinking: false },
					}),
					signal: controller.signal,
				});
				open = true;
				for await (const _chunk of res.body ?? []) lastTokenAt = performance.now();
			} catch {
				if (!controller.signal.aborted) await new Promise((r) => setTimeout(r, 1000));
			} finally {
				open = false;
			}
		}
	})();
	return {
		isActive: () => open && performance.now() - lastTokenAt < 2000,
		stop: async () => {
			controller.abort();
			await loop;
		},
	};
}
