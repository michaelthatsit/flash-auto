/** One entry per auto-routed model. The physical model judges its own requests. */
export interface AutoModel {
	virtualId: string;
	name: string;
	provider: string;
	physicalId: string;
	/** llama-swap front: used for the /running check and the readout. */
	baseUrl: string;
	/** Model name as llama-swap reports it in /running. */
	swapModel: string;
}

export const AUTO_MODELS: AutoModel[] = [
	{
		virtualId: "flash-auto",
		name: "Qwen3.8 Flash-Next (auto)",
		provider: "spark",
		physicalId: "qwen3.8-flash-next",
		baseUrl: "http://localhost:9000",
		swapModel: "qwen3.8-flash-next",
	},
];
