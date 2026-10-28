/**
 * Multi-Session Subagent Orchestration Extension (`/design` & `/deliver`)
 *
 * Combines Abyss multi-session orchestration (`BeautyyuYanli/abyss`) with
 * Uncle Bob's `ub-mode` engineering & quality-gate principles, backed by
 * `pi-subagent-manager`:
 *
 * 1. Design (`/design <task>` one-shot section `<design>`):
 *    Drafts `.context/proposals/YYMMDD-<slug>.md` with Mei's evidence-first
 *    research, `ub-mode` Foundational Thinking & Domain Architecture (data
 *    shape first, illegal states unrepresentable, boundary parsing + pure
 *    core functions, idempotency, state isolation), spawns a clean-slate
 *    `/abyss-proposal-review` subagent (`history: none`, shared workspace)
 *    to apply Subtract Before You Add & Laziness Protocol, simplifies in
 *    place, and delivers.
 *
 * 2. Deliver (`/deliver <task>` one-shot section `<deliver>`):
 *    Coordinator-driven implementation & quality-gate loop. Delegates coding to
 *    `/abyss-implementer` (Elysia + `ub-mode` Phase 1: TDD, data shape first,
 *    subtract before adding, verifiable units, action log), fans out 5 parallel
 *    blind reviewers (`code-hygiene` with CRAP < 10 & Dryer < 0.8,
 *    `correctness` with domain/boundary/idempotency/root-cause checks,
 *    `test-hygiene` with behavioral test discipline, `test-adequacy` with
 *    Mutator surviving-mutant checks, and `documentation` with domain glossary
 *    as Eden with P0–P3 classification), validates findings against raw
 *    workspace evidence, reuses the exact same 6 subagent sessions via
 *    `agent_steer` across rework rounds, and publishes
 *    `.context/impl/YYMMDD-<slug>.md`.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { resolveOneShotTask } from "../depth/index";

export type OrchestratedWorkflow = "design" | "deliver";

export type OrchestratedCommandAction =
	| { type: "run"; workflow: OrchestratedWorkflow; task: string }
	| { type: "invalid"; reason: "missing_task" | "unknown_workflow"; workflow?: OrchestratedWorkflow };

/** System prompt section names. Pi requires /^[a-z][a-z0-9_-]*$/ and rejects "preamble". */
export const WORKFLOW_SECTION_NAMES: Record<OrchestratedWorkflow, string> = {
	design: "design",
	deliver: "deliver",
};

/** EventBus discovery channel registered by `pi-subagent-manager` when active. */
export const SUBAGENT_CAPABILITY_PROBE_CHANNEL = "pi-subagent-manager:capabilities:probe";

export function isSubagentManagerLoaded(pi: { events?: { emit?: (channel: string, payload: unknown) => void } }): boolean {
	let active = false;
	pi.events?.emit?.(SUBAGENT_CAPABILITY_PROBE_CHANNEL, {
		respond: () => {
			active = true;
		},
	});
	return active;
}

/**
 * Mount `pi-subagent-manager` into the current extension runtime unless another
 * instance is already active in this session.
 */
export function mountSubagentManagerIfNeeded(
	pi: ExtensionAPI,
	mount: (pi: ExtensionAPI) => void,
): boolean {
	if (isSubagentManagerLoaded(pi as any)) {
		return false;
	}
	mount(pi);
	return true;
}

/** Canonical independent-root subagent paths (`/` prefix = shared workspace, no inherited history). */
export const SUBAGENT_PATHS = {
	designReviewer: "/abyss-proposal-review",
	implementer: "/abyss-implementer",
	reviewers: {
		codeHygiene: "/abyss-review-code-hygiene",
		correctness: "/abyss-review-correctness",
		testHygiene: "/abyss-review-test-hygiene",
		testAdequacy: "/abyss-review-test-adequacy",
		documentation: "/abyss-review-documentation",
	},
} as const;

export interface DeliverReviewAspect {
	id: "code-hygiene" | "correctness" | "test-hygiene" | "test-adequacy" | "documentation";
	path: string;
	directive: string;
}

export const DELIVER_REVIEW_ASPECTS: readonly DeliverReviewAspect[] = [
	{
		id: "code-hygiene",
		path: SUBAGENT_PATHS.reviewers.codeHygiene,
		directive:
			"The fixed aspect identifier is code-hygiene. Review code and logic hygiene only. Enforce low function complexity and high coverage (every function under CRAP 10 by splitting complex branches or covering paths), eliminate structural duplication (>= 0.8 similarity so one decision lives in one place), and Subtract Before You Add (delete dead code, unnecessary abstractions, and custom code duplicating existing utilities or dependencies).",
	},
	{
		id: "correctness",
		path: SUBAGENT_PATHS.reviewers.correctness,
		directive:
			"The fixed aspect identifier is correctness. Review correctness, architecture, and task completion only: verify that domain types make illegal states unrepresentable, external data is parsed once at the boundary while core logic stays pure, operations are idempotent, mutable shared state is separated or single-writer, root causes are fixed rather than hidden behind shallow guards, and the implementation fully satisfies the task or design.",
	},
	{
		id: "test-hygiene",
		path: SUBAGENT_PATHS.reviewers.testHygiene,
		directive:
			"The fixed aspect identifier is test-hygiene. Review test hygiene only (Test Behavior, Not Implementation). Tests must call the code the way its user does and check user-visible outcomes. Prefer deleting redundant, meaningless, or misleading tests—especially tests that would still pass if functions returned nothing, meaningless negative checks ('something does not exist'), implementation-coupled mock tests, and Texas sharpshooter fallacies. Recommend removal before adding or restructuring tests.",
	},
	{
		id: "test-adequacy",
		path: SUBAGENT_PATHS.reviewers.testAdequacy,
		directive:
			"The fixed aspect identifier is test-adequacy. Review test adequacy and mutation resilience only (cover the uncovered, kill surviving mutants). Inspect every new or modified branch, boundary, and condition to identify surviving mutants—places where altering logic or boundaries would not cause any behavioral test to fail.",
	},
	{
		id: "documentation",
		path: SUBAGENT_PATHS.reviewers.documentation,
		directive:
			"The fixed aspect identifier is documentation. Review implementation documentation and domain glossary consistency only: verify that domain terms are used consistently and that docstrings/comments explain non-obvious 'why' decisions and invariants. Treat any input design/proposal file as read-only input; do not edit it or request changes to it as documentation.",
	},
];

export const DESIGN_PROTOCOL_RULES = [
	"[DESIGN WORKFLOW — Foundational Architecture Draft -> Clean-Slate Complexity Review -> Simplify -> Deliver]",
	"Adopt Persona Mei + Foundational Thinking throughout this workflow:",
	"- Research the codebase and gather concrete evidence before concluding; never start by merely agreeing with the user.",
	"- Get the data shape right before logic: reason explicitly about domain types (making illegal states unrepresentable), lifecycle and ownership, underlying data storage models, and interface shapes.",
	"- Boundary & State Discipline: Parse external input once at the boundary and keep core business logic in pure functions; make operations idempotent; separate mutable state before serializing shared state.",
	"- Redesign From First Principles & Subtract Before You Add: Do not bolt a new requirement onto a mismatched old design; take complexity out before adding anything; guard against overengineering and unnecessary compatibility.",
	"Design Artifact Constraints:",
	"- Focus strictly on the implementation required to satisfy the task: data shapes, domain models, boundaries, interfaces, and business logic.",
	"- Do NOT add deployment plans, rollout/rollback procedures, validation/verification sections, operational runbooks, maintenance instructions, user/operator manuals, or generic checklists unless explicitly requested by the user.",
	"- Keep the artifact at `.context/proposals/YYMMDD-<slug>.md` free of modification history and unresolved questions. Change explanations belong in handoffs and user-facing delivery only.",
	"Execution Graph (orchestrate with pi-subagent-manager):",
	"1. [Draft or Load Revision] (in /root):",
	"   - Initial design (`task`): Inspect relevant files, resolve any material ambiguity with the user first, and create `.context/proposals/YYMMDD-<slug>.md` (creating the directory if needed).",
	"   - Existing design modification (`revision`): Read the existing file and the requested edits; carry those edits forward as pending work without creating a second file.",
	`2. [Independent Complexity Review] (clean-slate subagent \`${SUBAGENT_PATHS.designReviewer}\`, workspace: shared, history: none):`,
	"   - Call `agent_types` if needed to pick a suitable review/architect type (e.g., `reviewer` or `architect`).",
	`   - Spawn an independent root thread via \`agent_spawn({ path: "${SUBAGENT_PATHS.designReviewer}", type: "<reviewer|architect>", task: "<handoff>" })\` (if spawned with \`wait: false\`, call \`agent_wait({ path: "${SUBAGENT_PATHS.designReviewer}" })\`).`,
	"   - Using a root path starting with `/` (not `/root/...`) is mandatory so the reviewer starts with zero inherited conversation history.",
	`   - Instruct \`${SUBAGENT_PATHS.designReviewer}\`: read the design file (and any pending revision edits), review ONLY whether the design violates Laziness Protocol ("one decision in one place, smallest edit") or is overengineered, identify concrete simplifications that preserve the user's requirements, leave the file unchanged, and return the concrete simplifications with reasons (or state clearly when none are needed).`,
	"3. [Simplify] (in /root):",
	"   - Evaluate the complexity review against the user's requirements. Apply pending user-requested edits (for revisions) and accepted simplifications in place to `.context/proposals/YYMMDD-<slug>.md`.",
	`   - Clean up the reviewer session with \`agent_stop({ path: "${SUBAGENT_PATHS.designReviewer}" })\`.`,
	"4. [Deliver] (in /root):",
	"   - For an initial design: output the full final design text without wrapping the entire document in a fenced code block.",
	"   - For a revision: output only the updated sections with a concise prose explanation of which sections changed, what changed, and why (do not output diff blocks or original-vs-modified comparisons).",
];

export const DELIVER_PROTOCOL_RULES = [
	"[DELIVER WORKFLOW — Implementer (First Make it Work) + 5 Blind Reviewers (Then Make it Right) + Judge Loop]",
	"Coordinator & Ownership Rules (Persona Mei + Guard the Context Window):",
	"- You (`/root`) are the Coordinator and Judge. Do NOT edit implementation source or test files yourself; keep the main thread small by delegating bulk implementation and review to subagents.",
	`- Direct exactly 1 Implementer (\`${SUBAGENT_PATHS.implementer}\`) and 5 independent Reviewers (\`${SUBAGENT_PATHS.reviewers.codeHygiene}\`, \`${SUBAGENT_PATHS.reviewers.correctness}\`, \`${SUBAGENT_PATHS.reviewers.testHygiene}\`, \`${SUBAGENT_PATHS.reviewers.testAdequacy}\`, \`${SUBAGENT_PATHS.reviewers.documentation}\`).`,
	"- All 6 subagents MUST use independent root paths starting with `/` (not `/root/...`) so they share the workspace (`workspace: ^`) while starting with clean, isolated conversation history (`history: none`).",
	"- Stateful Call-Site Reuse: Create the 6 sessions with `agent_spawn` in Round 1, and REUSE those exact same 6 paths via `agent_steer` + `agent_wait` on every rework round so the Implementer and each Reviewer retain their own memory across rounds.",
	"Execution Graph (orchestrate with pi-subagent-manager):",
	`1. [Implement] (\`${SUBAGENT_PATHS.implementer}\` — Persona Elysia + First Make it Work):`,
	"   - Call `agent_types` once to select appropriate agent types (e.g., `coder` for implementation, `reviewer` for reviews).",
	`   - Round 1: \`agent_spawn({ path: "${SUBAGENT_PATHS.implementer}", type: "coder", task: "<task + constraints + design/doc path + First Make it Work instructions>" })\` (pass design/document file paths instead of copying their full contents).`,
	`   - Round 2+ (Rework): \`agent_steer({ path: "${SUBAGENT_PATHS.implementer}", message: "<Verified Aggregate Review Report + repair scope>" })\` followed by \`agent_wait({ path: "${SUBAGENT_PATHS.implementer}" })\`.`,
	"   - Instruct the Implementer:",
	"     * Follow First Make it Work: get data shapes & domain types right first, parse at boundaries and keep core logic pure, subtract complexity before adding, write the failing behavioral test before changing code (TDD), sequence work into small verifiable units, and fix root causes.",
	"     * Keep a Log of every significant action and the reason for taking it.",
	"     * Stop editing before returning, and return a Common Review Handoff containing ONLY (a) task and constraints, (b) change explanation & decision log summary, (c) check commands and results, and (d) any necessary out-of-scope changes — excluding all review reports.",
	"2. [5-Way Parallel Blind Review] (Persona Eden + Then Make it Right + P0–P3 classification):",
	"   - Send each of the 5 reviewers ONLY the Common Review Handoff. NEVER include another reviewer's report or the aggregate review report.",
	"   - Round 1: Spawn all 5 reviewers concurrently with `wait: false` BEFORE calling `agent_wait` on each:",
	...DELIVER_REVIEW_ASPECTS.map((aspect) => `     * \`${aspect.path}\` (\`${aspect.id}\`): ${aspect.directive}`),
	"   - Round 2+ (Rework): Resume all 5 existing reviewer sessions concurrently via `agent_steer({ path, message: commonReviewHandoff })` on all 5, then call `agent_wait({ path })` on all 5.",
	"   - Instruct every reviewer: inspect the shared workspace without editing files; on rework rounds check its own prior history to state whether prior findings are resolved or open; classify each finding as P0–P3 based on verifiable impact (`P0`: severe/irreversible harm to core goal, safety/security, permissions, or data; `P1`: materially blocks core goal or delivery; `P2`: local/secondary issue such as CRAP >= 10, duplication >= 0.8, surviving mutant, or implementation-coupled test; `P3`: negligible/cosmetic); order findings P0 -> P3; and return the aspect ID, explicit `PASS` or `FAILED`, and evidence-backed findings.",
	"3. [Validate & Route] (Judge in /root — Attack the Premise & Evidence Filter):",
	"   - Collect all 5 current-round reports (use `agent_output` if any output was truncated).",
	"   - Verify every finding yourself against the task, constraints, check results, and actual code in the shared workspace.",
	"   - Actively remove unsupported, irrelevant, unnecessary, overengineered, or out-of-scope findings. Merge duplicates and resolve conflicting recommendations using codebase evidence.",
	"   - If two rework attempts that share one premise fail the same gate, identify that broken premise explicitly in the repair scope so the Implementer redesigns from first principles.",
	"   - Build a Verified Aggregate Review Report (task, constraints, verified assessment of all 5 aspects kept distinct from raw reviewer verdicts, and retained P0–P3 findings ordered P0 -> P3 with evidence and repair scope; exclude removed findings).",
	"   - If ANY retained actionable finding remains (`rework`): loop back to Step 1 by steering `/abyss-implementer` with the Verified Aggregate Review Report and then re-running all 5 reviewers.",
	"   - When verification of all 5 current reports leaves ZERO retained actionable findings on the unchanged workspace implementation (`passed`): proceed to Step 4.",
	"4. [Publish & Cleanup] (in /root):",
	"   - Create `.context/impl/YYMMDD-<slug>.md` (creating the directory if needed) describing the final design and impact on callers/consumers, covering ONLY materially affected externally observable areas:",
	"     * Interfaces and contracts (inputs, outputs, errors, compatibility)",
	"     * Underlying data models and storage (representation, ownership, invariants)",
	"     * Lifecycles (creation, reuse, state transitions, cleanup of resources or sessions)",
	"     * Other externally observable behavior",
	"     (Omit editing/repair history, internal refactoring, file inventories, and review logs/verdicts.)",
	"   - Stop all 6 subagent sessions via `agent_stop`.",
	"   - Output the full contents of `.context/impl/YYMMDD-<slug>.md` without wrapping the whole report in a fenced code block.",
];

export function buildDesignProtocol(): string {
	return DESIGN_PROTOCOL_RULES.join("\n");
}

export function buildDeliverProtocol(): string {
	return DELIVER_PROTOCOL_RULES.join("\n");
}

export function buildOrchestratedProtocol(workflow: OrchestratedWorkflow): string {
	return workflow === "design" ? buildDesignProtocol() : buildDeliverProtocol();
}

export interface OrchestratedProtocolState {
	/** One-shot workflow armed for the next user run, if any. */
	oneShot: OrchestratedWorkflow | null;
	/** Last workflow consumed by a user run, kept alive only for custom subagent wake turns. */
	activeForCustomWake?: OrchestratedWorkflow | null;
	/** Message type of the starting run ("user" | "custom"). */
	messageType?: string;
}

/**
 * Write the active orchestrated workflow protocol into a system prompt `sections` map.
 *
 * Returns the one-shot workflow consumed by this call so the caller can disarm
 * `oneShot`. If `messageType === "custom"` (such as a `pi-subagent` wake turn)
 * while `activeForCustomWake` is set, the section stays present for that wake
 * turn and clears on the next normal user run.
 */
export function applyOrchestratedSections(
	sections: Record<string, string>,
	state: OrchestratedProtocolState,
): OrchestratedWorkflow | null {
	delete sections[WORKFLOW_SECTION_NAMES.design];
	delete sections[WORKFLOW_SECTION_NAMES.deliver];

	if (state.oneShot) {
		sections[WORKFLOW_SECTION_NAMES[state.oneShot]] = buildOrchestratedProtocol(state.oneShot);
		return state.oneShot;
	}

	if (state.messageType === "custom" && state.activeForCustomWake) {
		sections[WORKFLOW_SECTION_NAMES[state.activeForCustomWake]] = buildOrchestratedProtocol(
			state.activeForCustomWake,
		);
	}

	return null;
}

export function parseOrchestratedCommandArgs(argsRaw: string, editorText = ""): OrchestratedCommandAction {
	const trimmed = argsRaw.trim();
	const match = trimmed.match(/^(\S+)(?:\s+([\s\S]*))?$/);
	if (!match) {
		return { type: "invalid", reason: "unknown_workflow" };
	}

	const subcommand = match[1].toLowerCase().replace(/^workflow:/, "");
	const remainder = match[2] ?? "";

	if (subcommand !== "design" && subcommand !== "deliver") {
		return { type: "invalid", reason: "unknown_workflow" };
	}

	const resolved = resolveOneShotTask(remainder, editorText);
	if (!resolved) {
		return { type: "invalid", reason: "missing_task", workflow: subcommand };
	}

	return { type: "run", workflow: subcommand, task: resolved.task };
}

export default function orchestratedWorkflowsExtension(pi: ExtensionAPI): void {
	let pendingOneShot: OrchestratedWorkflow | null = null;
	let activeForCustomWake: OrchestratedWorkflow | null = null;

	function dispatchUserTask(ctx: ExtensionContext, task: string): void {
		if (ctx.isIdle()) {
			pi.sendUserMessage(task);
		} else {
			pi.sendUserMessage(task, { deliverAs: "followUp" });
		}
	}

	function triggerWorkflow(workflow: OrchestratedWorkflow, args: string, ctx: ExtensionContext): void {
		const editorDraft = typeof ctx.ui?.getEditorText === "function" ? ctx.ui.getEditorText() : "";
		const resolved = resolveOneShotTask(args, editorDraft);

		if (!resolved) {
			ctx.ui.notify(`Usage: /${workflow} <task> (or type a draft in the editor first)`, "warning");
			return;
		}

		if (resolved.usedEditorDraft && typeof ctx.ui?.setEditorText === "function") {
			ctx.ui.setEditorText("");
		}

		pendingOneShot = workflow;
		dispatchUserTask(ctx, resolved.task);
	}

	pi.on("before_agent_start", async (event) => {
		const sections = event.systemPromptOptions.sections;
		const messageType = (event as any)?.messageType;

		const consumed = applyOrchestratedSections(sections, {
			oneShot: pendingOneShot,
			activeForCustomWake,
			messageType,
		});

		if (consumed) {
			pendingOneShot = null;
			activeForCustomWake = consumed;
		} else if (messageType !== "custom") {
			activeForCustomWake = null;
		}
	});

	pi.registerCommand("design", {
		description:
			"Draft an architecture/design proposal (.context/proposals/YYMMDD-<slug>.md) with a clean-slate subagent complexity review",
		handler: async (args, ctx) => {
			triggerWorkflow("design", args, ctx);
		},
	});

	pi.registerCommand("deliver", {
		description:
			"Deliver a feature or design via 1 TDD implementer + 5 parallel blind reviewers (CRAP, Dryer, Mutator, behavioral tests) -> .context/impl/YYMMDD-<slug>.md",
		handler: async (args, ctx) => {
			triggerWorkflow("deliver", args, ctx);
		},
	});
}
