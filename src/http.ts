import type { Classification } from "./types.ts";

type Failure = Extract<Classification, { ok: false }>;

/** POST JSON with a timeout; maps every failure to a Classification error. */
export async function postJson(
	fetchFn: typeof fetch,
	url: string,
	body: unknown,
	timeoutMs: number,
	signal?: AbortSignal,
): Promise<{ ok: true; json: any; latencyMs: number } | Failure> {
	const signals = [AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])];
	const start = performance.now();
	const latency = () => performance.now() - start;
	let res: Response;
	try {
		res = await fetchFn(url, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
			signal: AbortSignal.any(signals),
		});
	} catch (err) {
		const name = (err as Error)?.name;
		const error = name === "AbortError" || name === "TimeoutError" ? "timeout" : "unavailable";
		return { ok: false, error, detail: String(err), latencyMs: latency() };
	}
	if (!res.ok) {
		return { ok: false, error: "http", detail: `${res.status} ${(await res.text()).slice(0, 200)}`, latencyMs: latency() };
	}
	try {
		const json = await res.json();
		return { ok: true, json, latencyMs: latency() };
	} catch (err) {
		return { ok: false, error: "parse", detail: String(err), latencyMs: latency() };
	}
}
