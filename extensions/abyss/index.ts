/**
 * Abyss Extension — Multi-Session Subagent Orchestration (`proposal` & `impl`)
 *
 * Adapts the two core workflows from BeautyyuYanli/abyss into zero-ceremony
 * Pi system-prompt sections backed by `pi-subagent-manager`:
 *
 * 1. Proposal (`/proposal <task>` one-shot section `<proposal>`):
 *    Drafts `.context/proposals/YYMMDD-<slug>.md` with Mei's research & anti-bloat
 *    constraints, spawns a clean-slate `/abyss-proposal-review` subagent (`history: none`,
 *    shared workspace) solely to strip overengineering, simplifies in place, and delivers.
 *
 * 2. Impl (`/impl <task>` one-shot section `<impl>`):
 *    Coordinator-driven implementation loop. Delegates coding to `/abyss-implementer`
 *    (Elysia), fans out 5 orthogonal blind review subagents in parallel (`code-hygiene`,
 *    `correctness`, `test-hygiene`, `test-adequacy`, `documentation` as Eden with P0–P3
 *    classification), validates findings against raw workspace evidence to filter noise,
 *    reuses the exact same 6 subagent sessions via `agent_steer` across rework rounds,
 *    and publishes `.context/impl/YYMMDD-<slug>.md`.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { resolveOneShotTask } from "../depth/index";

export type AbyssWorkflow = "proposal" | "impl";

export type AbyssCommandAction =
	| { type: "run"; workflow: AbyssWorkflow; task: string }
	| { type: "invalid"; reason: "missing_task" | "unknown_workflow"; workflow?: AbyssWorkflow };

/** System prompt section names. Pi requires /^[a-z][a-z0-9_-]*$/ and rejects "preamble". */
export const ABYSS_SECTION_NAMES: Record<AbyssWorkflow, string> = {
	proposal: "proposal",
	impl: "impl",
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
export const ABYSS_SUBAGENT_PATHS = {
	proposalReviewer: "/abyss-proposal-review",
	implementer: "/abyss-implementer",
	reviewers: {
		codeHygiene: "/abyss-review-code-hygiene",
		correctness: "/abyss-review-correctness",
		testHygiene: "/abyss-review-test-hygiene",
		testAdequacy: "/abyss-review-test-adequacy",
		documentation: "/abyss-review-documentation",
	},
} as const;

export interface ImplReviewAspect {
	id: "code-hygiene" | "correctness" | "test-hygiene" | "test-adequacy" | "documentation";
	path: string;
	directive: string;
}

export const IMPL_REVIEW_ASPECTS: readonly ImplReviewAspect[] = [
	{
		id: "code-hygiene",
		path: ABYSS_SUBAGENT_PATHS.reviewers.codeHygiene,
		directive:
			"The fixed aspect identifier is code-hygiene. Review code and logic hygiene only. Prefer deletion and simplification. Identify dead paths, duplication, unnecessary abstractions, code smells, and custom code duplicating functionality in the codebase, current dependencies, or a well-established and actively maintained library.",
	},
	{
		id: "correctness",
		path: ABYSS_SUBAGENT_PATHS.reviewers.correctness,
		directive:
			"The fixed aspect identifier is correctness. Review correctness and task completion only: whether the implementation behaves correctly and fully satisfies the task, proposal, or document.",
	},
	{
		id: "test-hygiene",
		path: ABYSS_SUBAGENT_PATHS.reviewers.testHygiene,
		directive:
			"The fixed aspect identifier is test-hygiene. Review test hygiene only. Prefer deleting redundant, meaningless, or misleading tests, especially new tests. Identify meaningless negative checks such as 'something does not exist' and tests exhibiting the Texas sharpshooter fallacy. Recommend removal before adding or restructuring tests.",
	},
	{
		id: "test-adequacy",
		path: ABYSS_SUBAGENT_PATHS.reviewers.testAdequacy,
		directive:
			"The fixed aspect identifier is test-adequacy. Review test adequacy only: whether meaningful tests sufficiently verify the task's behavior and relevant regressions.",
	},
	{
		id: "documentation",
		path: ABYSS_SUBAGENT_PATHS.reviewers.documentation,
		directive:
			"The fixed aspect identifier is documentation. Review implementation documentation only: the sufficiency of notes, docstrings, comments, and documentation. Treat the proposal as implementation input; do not edit it or request changes to it as documentation.",
	},
];

export const PROPOSAL_PROTOCOL_RULES = [
	"[ABYSS PROPOSAL WORKFLOW — Draft -> Clean-Slate Complexity Review -> Simplify -> Deliver]",
	"Adopt Persona Mei throughout this workflow:",
	"- Research the codebase and gather concrete evidence before concluding; never start by merely agreeing with the user.",
	"- Reason explicitly about lifecycle and ownership, underlying data storage models, and interfaces and their shapes.",
	"- Continuously guard against overengineering and unnecessary compatibility; focus on practical intent over literal wording.",
	"Proposal Content & Artifact Constraints:",
	"- Focus strictly on the implementation required to satisfy the task: business logic, code changes, interfaces, data models, and infrastructure schemas only when they are part of the implementation.",
	"- Do NOT add deployment plans, rollout/rollback procedures, validation/verification sections, operational runbooks, maintenance instructions, user/operator manuals, or generic checklists unless explicitly requested by the user.",
	"- Keep the proposal artifact at `.context/proposals/YYMMDD-<slug>.md` free of modification history and unresolved questions. Change explanations belong in handoffs and user-facing delivery only.",
	"Execution Graph (orchestrate with pi-subagent-manager):",
	"1. [Draft or Load Revision] (in /root):",
	"   - Initial proposal (`task`): Inspect relevant files, resolve any material proposal ambiguity with the user first, and create `.context/proposals/YYMMDD-<slug>.md` (creating the directory if needed).",
	"   - Existing proposal modification (`revision`): Read the existing proposal file and the requested edits; carry those edits forward as pending work without creating a second file.",
	"2. [Independent Complexity Review] (clean-slate subagent `/abyss-proposal-review`, workspace: shared, history: none):",
	"   - Call `agent_types` if needed to pick a suitable review/architect type (e.g., `reviewer` or `architect`).",
	`   - Spawn an independent root thread via \`agent_spawn({ path: "${ABYSS_SUBAGENT_PATHS.proposalReviewer}", type: "<reviewer|architect>", task: "<handoff>" })\` (if spawned with \`wait: false\`, call \`agent_wait({ path: "${ABYSS_SUBAGENT_PATHS.proposalReviewer}" })\`).`,
	"   - Using a root path starting with `/` (not `/root/...`) is mandatory so the reviewer starts with zero inherited conversation history.",
	"   - Instruct `/abyss-proposal-review`: read the proposal file (and any pending revision edits), review ONLY whether the proposal is overengineered, identify concrete simplifications that preserve the user's requirements, leave the proposal file unchanged, and return the concrete simplifications with reasons (or state clearly when none are needed).",
	"3. [Simplify] (in /root):",
	"   - Evaluate the complexity review against the user's requirements. Apply pending user-requested edits (for revisions) and accepted simplifications in place to `.context/proposals/YYMMDD-<slug>.md`.",
	`   - Clean up the reviewer session with \`agent_stop({ path: "${ABYSS_SUBAGENT_PATHS.proposalReviewer}" })\`.`,
	"4. [Deliver] (in /root):",
	"   - For an initial proposal: output the full final proposal text without wrapping the entire proposal in a fenced code block.",
	"   - For a revision: output only the updated sections with a concise prose explanation of which sections changed, what changed, and why (do not output diff blocks or original-vs-modified comparisons).",
];

export const IMPL_PROTOCOL_RULES = [
	"[ABYSS IMPL WORKFLOW — Implementer + 5 Orthogonal Blind Reviewers + Judge Loop -> Delivery Report]",
	"Coordinator & Ownership Rules (Persona Mei + impl-loop):",
	"- You (`/root`) are the Coordinator and Judge. Do NOT edit implementation source or test files yourself.",
	`- Direct exactly 1 Implementer (\`${ABYSS_SUBAGENT_PATHS.implementer}\`) and 5 independent Reviewers (\`${ABYSS_SUBAGENT_PATHS.reviewers.codeHygiene}\`, \`${ABYSS_SUBAGENT_PATHS.reviewers.correctness}\`, \`${ABYSS_SUBAGENT_PATHS.reviewers.testHygiene}\`, \`${ABYSS_SUBAGENT_PATHS.reviewers.testAdequacy}\`, \`${ABYSS_SUBAGENT_PATHS.reviewers.documentation}\`).`,
	"- All 6 subagents MUST use independent root paths starting with `/` (not `/root/...`) so they share the workspace (`workspace: ^`) while starting with clean, isolated conversation history (`history: none`).",
	"- Stateful Call-Site Reuse: Create the 6 sessions with `agent_spawn` in Round 1, and REUSE those exact same 6 paths via `agent_steer` + `agent_wait` on every rework round so the Implementer and each Reviewer retain their own memory across rounds.",
	"Execution Graph (orchestrate with pi-subagent-manager):",
	`1. [Implement] (\`${ABYSS_SUBAGENT_PATHS.implementer}\` — Persona Elysia):`,
	"   - Call `agent_types` once to select appropriate agent types (e.g., `coder` for implementation, `reviewer` for reviews).",
	`   - Round 1: \`agent_spawn({ path: "${ABYSS_SUBAGENT_PATHS.implementer}", type: "coder", task: "<task + constraints + proposal/doc path + Persona Elysia instructions>" })\` (pass proposal/document file paths instead of copying their full contents).`,
	`   - Round 2+ (Rework): \`agent_steer({ path: "${ABYSS_SUBAGENT_PATHS.implementer}", message: "<Verified Aggregate Review Report + repair scope>" })\` followed by \`agent_wait({ path: "${ABYSS_SUBAGENT_PATHS.implementer}" })\`.`,
	"   - Instruct the Implementer: implement the requested work or repairs in the shared workspace, run appropriate checks/tests, stop editing before returning, and return a Common Review Handoff containing ONLY (a) task and constraints, (b) change explanation, (c) check commands and results, and (d) any necessary out-of-scope changes — excluding all review reports.",
	"2. [5-Way Parallel Blind Review] (Persona Eden + impl-review + classify-priority):",
	"   - Send each of the 5 reviewers ONLY the Common Review Handoff. NEVER include another reviewer's report or the aggregate review report.",
	"   - Round 1: Spawn all 5 reviewers concurrently with `wait: false` BEFORE calling `agent_wait` on each:",
	...IMPL_REVIEW_ASPECTS.map((aspect) => `     * \`${aspect.path}\` (\`${aspect.id}\`): ${aspect.directive}`),
	"   - Round 2+ (Rework): Resume all 5 existing reviewer sessions concurrently via `agent_steer({ path, message: commonReviewHandoff })` on all 5, then call `agent_wait({ path })` on all 5.",
	"   - Instruct every reviewer: inspect the shared workspace without editing files; on rework rounds check its own prior history to state whether prior findings are resolved or open; classify each finding as P0–P3 based on verifiable impact (`P0`: severe/irreversible harm to core goal, safety/security, permissions, or data; `P1`: materially blocks core goal or delivery; `P2`: local/secondary issue; `P3`: negligible/cosmetic); order findings P0 -> P3; and return the aspect ID, explicit `PASS` or `FAILED`, and evidence-backed findings.",
	"3. [Validate & Route] (Judge in /root — impl-validate):",
	"   - Collect all 5 current-round reports (use `agent_output` if any output was truncated).",
	"   - Verify every finding yourself against the task, constraints, check results, and actual code in the shared workspace.",
	"   - Actively remove unsupported, irrelevant, unnecessary, overengineered, or out-of-scope findings. Merge duplicates and resolve conflicting recommendations using codebase evidence.",
	"   - Build a Verified Aggregate Review Report (task, constraints, verified assessment of all 5 aspects kept distinct from raw reviewer verdicts, and retained P0–P3 findings ordered P0 -> P3 with evidence and repair scope; exclude removed findings).",
	"   - If ANY retained actionable finding remains (`rework`): loop back to Step 1 by steering `/abyss-implementer` with the Verified Aggregate Review Report and then re-running all 5 reviewers.",
	"   - When verification of all 5 current reports leaves ZERO retained actionable findings on the unchanged workspace implementation (`passed`): proceed to Step 4.",
	"4. [Publish & Cleanup] (in /root — impl-delivery):",
	"   - Create `.context/impl/YYMMDD-<slug>.md` (creating the directory if needed) describing the final design and impact on callers/consumers, covering ONLY materially affected externally observable areas:",
	"     * Interfaces and contracts (inputs, outputs, errors, compatibility)",
	"     * Underlying data models and storage (representation, ownership, invariants)",
	"     * Lifecycles (creation, reuse, state transitions, cleanup of resources or sessions)",
	"     * Other externally observable behavior",
	"     (Omit editing/repair history, internal refactoring, file inventories, and review logs/verdicts.)",
	"   - Stop all 6 subagent sessions via `agent_stop`.",
	"   - Output the full contents of `.context/impl/YYMMDD-<slug>.md` without wrapping the whole report in a fenced code block.",
];

export function buildProposalProtocol(): string {
	return PROPOSAL_PROTOCOL_RULES.join("\n");
}

export function buildImplProtocol(): string {
	return IMPL_PROTOCOL_RULES.join("\n");
}

export function buildAbyssProtocol(workflow: AbyssWorkflow): string {
	return workflow === "proposal" ? buildProposalProtocol() : buildImplProtocol();
}

export interface AbyssProtocolState {
	/** One-shot workflow armed for the next user run, if any. */
	oneShot: AbyssWorkflow | null;
	/** Last workflow consumed by a user run, kept alive only for custom subagent wake turns. */
	activeForCustomWake?: AbyssWorkflow | null;
	/** Message type of the starting run ("user" | "custom"). */
	messageType?: string;
}

/**
 * Write the active Abyss workflow protocol into a system prompt `sections` map.
 *
 * Returns the one-shot workflow consumed by this call so the caller can disarm
 * `oneShot`. If `messageType === "custom"` (such as a `pi-subagent` wake turn)
 * while `activeForCustomWake` is set, the section stays present for that wake
 * turn and clears on the next normal user run.
 */
export function applyAbyssSections(
	sections: Record<string, string>,
	state: AbyssProtocolState,
): AbyssWorkflow | null {
	delete sections[ABYSS_SECTION_NAMES.proposal];
	delete sections[ABYSS_SECTION_NAMES.impl];

	if (state.oneShot) {
		sections[ABYSS_SECTION_NAMES[state.oneShot]] = buildAbyssProtocol(state.oneShot);
		return state.oneShot;
	}

	if (state.messageType === "custom" && state.activeForCustomWake) {
		sections[ABYSS_SECTION_NAMES[state.activeForCustomWake]] = buildAbyssProtocol(state.activeForCustomWake);
	}

	return null;
}

export function parseAbyssCommandArgs(argsRaw: string, editorText = ""): AbyssCommandAction {
	const trimmed = argsRaw.trim();
	const match = trimmed.match(/^(\S+)(?:\s+([\s\S]*))?$/);
	if (!match) {
		return { type: "invalid", reason: "unknown_workflow" };
	}

	const subcommand = match[1].toLowerCase().replace(/^workflow:/, "");
	const remainder = match[2] ?? "";

	if (subcommand !== "proposal" && subcommand !== "impl") {
		return { type: "invalid", reason: "unknown_workflow" };
	}

	const resolved = resolveOneShotTask(remainder, editorText);
	if (!resolved) {
		return { type: "invalid", reason: "missing_task", workflow: subcommand };
	}

	return { type: "run", workflow: subcommand, task: resolved.task };
}

export default function abyssExtension(pi: ExtensionAPI): void {
	let pendingOneShot: AbyssWorkflow | null = null;
	let activeForCustomWake: AbyssWorkflow | null = null;

	function dispatchUserTask(ctx: ExtensionContext, task: string): void {
		if (ctx.isIdle()) {
			pi.sendUserMessage(task);
		} else {
			pi.sendUserMessage(task, { deliverAs: "followUp" });
		}
	}

	function triggerWorkflow(workflow: AbyssWorkflow, args: string, ctx: ExtensionContext): void {
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

		const consumed = applyAbyssSections(sections, {
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

	pi.registerCommand("proposal", {
		description:
			"Run Abyss proposal workflow (draft .context/proposals/YYMMDD-<slug>.md -> clean-slate complexity review -> simplify -> deliver)",
		handler: async (args, ctx) => {
			triggerWorkflow("proposal", args, ctx);
		},
	});

	pi.registerCommand("impl", {
		description:
			"Run Abyss impl workflow (implementer + 5 parallel blind reviewers + judge validation loop -> .context/impl/YYMMDD-<slug>.md)",
		handler: async (args, ctx) => {
			triggerWorkflow("impl", args, ctx);
		},
	});

	pi.registerCommand("abyss", {
		description: "Run an Abyss workflow: `/abyss proposal <task>` or `/abyss impl <task>`",
		handler: async (args, ctx) => {
			const editorDraft = typeof ctx.ui?.getEditorText === "function" ? ctx.ui.getEditorText() : "";
			const action = parseAbyssCommandArgs(args, editorDraft);

			if (action.type === "invalid") {
				if (action.reason === "missing_task" && action.workflow) {
					ctx.ui.notify(
						`Usage: /abyss ${action.workflow} <task> (or type a draft in the editor first)`,
						"warning",
					);
				} else {
					ctx.ui.notify("Usage: /abyss <proposal|impl> <task>", "warning");
				}
				return;
			}

			const inlineRemainder = args.trim().replace(/^\S+\s*/, "");
			if (!inlineRemainder.trim() && editorDraft.trim() && typeof ctx.ui?.setEditorText === "function") {
				ctx.ui.setEditorText("");
			}

			pendingOneShot = action.workflow;
			dispatchUserTask(ctx, action.task);
		},
	});
}
