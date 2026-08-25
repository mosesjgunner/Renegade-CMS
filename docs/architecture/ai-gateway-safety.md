# AI gateway safety and usage

The AI gateway is optional. With no active, compatible connection or budget, ordinary editorial work continues and the caller receives an explicit recoverable state. It returns proposals only; applying a proposal remains a separate human/editorial workflow action.

Tasks are registered in `src/modules/ai/contracts.ts` with a capability, input allowlist, output shape, timeout, context ceiling, permission, audit requirement, sensitive-data rule and fallback. The inspected context preview identifies exactly which article, selection, brand voice, sources and visible post IDs were supplied. Private editorial notes are rejected by the gateway; they are not a provider input.

Imported material, source text and discussion posts are data rather than instructions. The gateway directs models not to acquire authority or use tools, sends only public published discussion posts, validates proposal shapes, redacts provider diagnostics and never retries a request implicitly. Cancellation and provider failure leave drafts unchanged. Usage tokens and a configured estimate are returned with every successful proposal; per-task and monthly budgets are enforced before execution and high-cost responses are withheld.

OpenAI-compatible endpoints are the first adapter, covering OpenAI-compatible BYO endpoints and Qwen-compatible deployments. A local Ollama adapter is included because it is directly testable over its documented local HTTP contract. Gemini is deliberately deferred: this repository has no Gemini SDK or provider contract test evidence, so adding it would be an unverified provider-specific surface.

Agents must use reviewed `ToolManifest` entries with explicit grants and scope checks. They may propose/read only in their own Site, Publication and Space. Publishing, scheduling, permissions, provider connection changes, bulk delivery, social posting, spending, anchoring, moderation and external imports have no AI agent tool in this milestone.
