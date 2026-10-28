/**
 * Solo Workflow Extension — Scenario-Driven Toggles (`/debug`, `/tdd`) & One-Shots (`/explore`, `/drive`, `/refactor`)
 *
 * Distills Felix Rieseberg's ambition dimensions and Uncle Bob's `ub-mode`
 * ("First Make it Work, Then Make it Right, Follow Practice") into developer
 * scenario primitives:
 *
 * Persistent Toggles (can be active individually or together):
 * 1. Debug (`Alt+D` or `/debug` — `🔍 debug` — `<debug>` section):
 *    Root-cause investigation & verification. Inspect rawest material first,
 *    frame with 4 lines ([Gap], [Raw], [Method], [Judge]), reproduce and fix
 *    root causes (never hide crashes behind shallow guards), attack broken
 *    premises when two fixes fail the same gate, and run the [Judge] command.
 * 2. TDD (`Alt+T` or `/tdd` — `🧪 tdd` — `<tdd>` section):
 *    Disciplined coding ("First Make it Work"). Get data shapes & domain types
 *    right before logic (make illegal states unrepresentable), validate at
 *    boundaries and keep core logic pure, subtract complexity before adding,
 *    and follow strict Red-Green-Refactor behavioral TDD.
 *
 * One-Shot Scenario Commands (apply to the next run only):
 * 3. Explore (`/explore <task>` — `<explore>` section):
 *    Explore 3 orthogonal hypotheses/approaches ([Space], [Disqualifier],
 *    [Sweep], [Pick]), run fast disqualifiers before coding, and sweep the
 *    entire repository for sibling occurrences.
 * 4. Drive (`/drive <task>` — `<drive>` section):
 *    Autonomous end-to-end execution loop ([Finish Line], [Self-Check Loop],
 *    [Boundaries], [Stop Condition]). Sequence work into small verifiable
 *    units, build the lever when bulk work is non-obvious, and iterate until
 *    verified without stopping halfway to ask permission.
 * 5. Refactor (`/refactor <task>` — `<refactor>` section):
 *    Clean up working code ("Then Make it Right"). Frame with 4 lines ([Pin],
 *    [Hotspots], [Mutations], [Proof]), replace implementation-coupled tests
 *    with behavioral tests, reduce function complexity (`CRAP < 10`), eliminate
 *    duplication (`Dryer < 0.8`), kill surviving mutants, and delete dead code.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

export type ToggleCommandAction =
	| { type: "toggle" }
	| { type: "enable" }
	| { type: "disable" }
	| { type: "run"; task: string };

export type ToggleMode = "debug" | "tdd";

export type OneShotScenario = "explore" | "drive" | "refactor";

/** System prompt section names. Pi requires /^[a-z][a-z0-9_-]*$/ and rejects "preamble". */
export const SECTION_NAMES: Record<ToggleMode | OneShotScenario, string> = {
	debug: "debug",
	tdd: "tdd",
	explore: "explore",
	drive: "drive",
	refactor: "refactor",
};

export const DEBUG_PROTOCOL_RULES = [
	"[DEBUG MODE ACTIVE — Inspect raw material, fix root causes, and verify with an Outside Judge]",
	"Before proposing a fix or editing code, inspect the rawest material in the workspace (actual source files, logs, ASTs, traces, or reproduction fixtures) using read/bash. Never guess from surface symptoms.",
	"After initial inspection, start your response with this exact 4-line framing block:",
	"  [Gap] What a field-leading expert would examine here that the prompt or surface symptom omitted.",
	"  [Raw] The exact raw files, traces, or data sources you inspected.",
	"  [Method] The concrete instrument or method you are using (e.g., minimal repro, rg, ast-grep, profiler, benchmark, property test) instead of hand-wavy review.",
	"  [Judge] The exact shell command that acts as the Outside Judge to reproduce the bug and falsify or verify the fix.",
	"Root-Cause & Execution Rules:",
	"- Do NOT stop and ask for approval after the 4-line block; proceed directly to diagnosis and fix.",
	"- Fix Root Causes: Reproduce the failure first, then fix the underlying cause. A guard that merely hides the crash or symptom is NOT a fix.",
	"- Attack the Premise: When two fixes that share one premise fail the same gate, state that premise in one sentence, count which actors hold the imbalance, and remove the broken premise before trying another fix.",
	"- Never grade your own homework: run the [Judge] command via bash before finishing and report the real output.",
];

export const TDD_PROTOCOL_RULES = [
	"[TDD MODE ACTIVE — First Make it Work: Data Shape First, Pure Boundaries, Subtract First, Behavioral TDD]",
	"Apply these engineering rules to every code change:",
	"1. Foundational Thinking & Domain Architecture:",
	"   - Get the data shape right before you write the logic; do first whatever helps every later phase.",
	"   - Model the domain so illegal states are unrepresentable in the type system; do not silence the compiler.",
	"   - Boundary Discipline: Parse and validate external data once where it enters; inside the boundary, trust the types and keep business logic in pure functions.",
	"   - Separate Before Serializing Shared State: If concurrent actors do not need the same mutable state, give each its own; if they do, enforce a single writer structurally.",
	"   - Make operations idempotent so running twice or recovering after a crash ends in the same state.",
	"2. Subtract Before You Add & First Principles:",
	"   - Take complexity out before you add anything new.",
	"   - Do not bolt a new requirement onto a mismatched old design; ask what you would have built if the requirement existed from the start and deliver it in small verifiable units.",
	"   - Laziness Protocol: One decision lives in one place. Ship the smallest edit that solves the problem.",
	"3. Behavioral Red-Green-Refactor TDD:",
	"   - Write the failing behavioral test before you change production code, and see it fail for the reason you expect.",
	"   - Test Behavior, Not Implementation: Call the code the way its user does and assert externally observable results. If a test would still pass when functions returned nothing, do not write it (and delete existing ones). If an honest test is impractical, do not write a bad one.",
	"   - Make the smallest code change that turns the failing test green, then refactor while keeping tests green.",
];

export const EXPLORE_PROTOCOL_RULES = [
	"[EXPLORE MODE — Map orthogonal options, run fast disqualifiers, and sweep the whole repository]",
	"Do NOT lock onto your first hypothesis or patch a single isolated spot.",
	"After initial inspection of the codebase, start your response with this exact 4-line framing block:",
	"  [Space] 3 genuinely different approaches or root-cause hypotheses (distinct mechanisms, not minor variations).",
	"  [Disqualifier] The fastest concrete check or evidence that would rule each option out.",
	"  [Sweep] How to scan the entire repository (via rg/ast-grep) for all sibling occurrences of this pattern or issue.",
	"  [Pick] Which option wins after running the disqualifier checks, and why (preferring the smallest design where one decision lives in one place).",
	"Execution rules:",
	"- Run the cheap disqualifier checks via read/bash BEFORE writing production changes.",
	"- Attack the Premise: If two candidate hypotheses sharing an assumption fail the same check, state and discard that shared premise immediately.",
	"- If fixing a class of bug or pattern, audit and fix all matching instances across the codebase (or explicitly list any skipped).",
];

export const DRIVE_PROTOCOL_RULES = [
	"[DRIVE MODE — Define the finish line, sequence into verifiable units, and iterate until green]",
	"Treat this task as an end-to-end autonomous mission, not a single conversational turn.",
	"After inspecting the workspace, start your response with this exact 4-line framing block:",
	"  [Finish Line] The exact observable end state that means the entire task is 100% done.",
	"  [Self-Check Loop] The exact command(s) (test, build, typecheck, repro script) you will run after each unit to verify progress.",
	"  [Boundaries] Files/interfaces in scope vs. off-limits, and what edge cases must be covered.",
	"  [Stop Condition] The only conditions under which you will pause to ask the user (e.g., destructive action or ambiguous product choice).",
	"Execution rules:",
	"- Do NOT stop partway to ask 'Should I proceed?' or hand back unverified work.",
	"- Sequence Work into Verifiable Units: Finish one small unit and verify it with [Self-Check Loop] before starting the next. A planned intermediate break is allowed only when you can undo it.",
	"- Build the Lever: If repetitive or structural work is not obvious at a glance, do one unit by hand, then build or run a deterministic script/tool that matches that unit.",
	"- Attack the Premise: Work in an iterative [Edit -> Run Self-Check -> Read Failure -> Fix] loop until [Finish Line] passes cleanly. When two fixes that share one premise fail the same gate, state that premise in one sentence and discard it rather than repeating the same approach.",
];

export const REFACTOR_PROTOCOL_RULES = [
	"[REFACTOR MODE — Then Make it Right: Pin Behavior, CRAP < 10, Duplication < 0.8, Kill Surviving Mutants]",
	"Improve structure, complexity, duplication, and test thoroughness while preserving external behavior.",
	"After inspecting the target code and tests, start your response with this exact 4-line framing block:",
	"  [Pin] The behavioral test command(s) pinning current externally observable behavior before structural changes.",
	"  [Hotspots] Functions with high complexity/low coverage (target CRAP < 10), duplicate blocks (target similarity < 0.8), and dead code to delete.",
	"  [Mutations] Specific branches, boundaries, or conditions where a mutant (altered logic) would currently survive unnoticed by tests.",
	"  [Proof] The exact verification command(s) proving the refactored structure passes all checks with zero behavioral regression.",
	"Execution rules:",
	"- Pin What the Code Does (Test Behavior, Not Implementation): Ensure tests call the code the way its user does and check user-visible outcomes. Delete meaningless tests that would still pass if functions returned nothing or only assert internal mock wiring.",
	"- Complexity & Coverage Gate (CRAP < 10): Keep every target function under CRAP 10 by splitting complex branches, covering uncovered paths with behavioral tests, or both (using the project's native test/coverage tools or direct structural inspection).",
	"- Duplication Gate (Similarity < 0.8): Eliminate structural duplication (>= 0.8 similarity) and consolidate so one decision lives in one place.",
	"- Mutation Gate (Cover the Uncovered, Kill Survivors, Delete Dead Code): Verify each [Mutations] hotspot by adding behavioral assertions that fail if that branch/boundary is altered, and delete all unreachable or dead code.",
	"- Sequence refactoring into small verifiable steps and run [Proof] via bash before finishing.",
];

export function buildDebugProtocol(): string {
	return DEBUG_PROTOCOL_RULES.join("\n");
}

export function buildTddProtocol(): string {
	return TDD_PROTOCOL_RULES.join("\n");
}

export function buildExploreProtocol(): string {
	return EXPLORE_PROTOCOL_RULES.join("\n");
}

export function buildDriveProtocol(): string {
	return DRIVE_PROTOCOL_RULES.join("\n");
}

export function buildRefactorProtocol(): string {
	return REFACTOR_PROTOCOL_RULES.join("\n");
}

export function buildToggleProtocol(mode: ToggleMode): string {
	return mode === "debug" ? buildDebugProtocol() : buildTddProtocol();
}

export function buildOneShotProtocol(scenario: OneShotScenario): string {
	switch (scenario) {
		case "explore":
			return buildExploreProtocol();
		case "drive":
			return buildDriveProtocol();
		case "refactor":
			return buildRefactorProtocol();
	}
}

export interface ProtocolState {
	/** Persistent `/debug` toggle (`Alt+D`). */
	debugEnabled: boolean;
	/** Persistent `/tdd` toggle (`Alt+T`). */
	tddEnabled?: boolean;
	/** One-shot scenario armed for the next run, if any. */
	oneShot: OneShotScenario | null;
}

/**
 * Write the active protocols into a system prompt `sections` map.
 *
 * Returns the one-shot scenario that this call applied, so the caller can
 * disarm it. Applying a one-shot is idempotent: the caller disarms it after the
 * run starts, which is what makes the protocol one-shot.
 */
export function applyProtocolSections(
	sections: Record<string, string>,
	state: ProtocolState,
): OneShotScenario | null {
	if (state.debugEnabled) {
		sections[SECTION_NAMES.debug] = buildDebugProtocol();
	} else {
		delete sections[SECTION_NAMES.debug];
	}

	if (state.tddEnabled) {
		sections[SECTION_NAMES.tdd] = buildTddProtocol();
	} else {
		delete sections[SECTION_NAMES.tdd];
	}

	delete sections[SECTION_NAMES.explore];
	delete sections[SECTION_NAMES.drive];
	delete sections[SECTION_NAMES.refactor];

	if (state.oneShot) {
		sections[SECTION_NAMES[state.oneShot]] = buildOneShotProtocol(state.oneShot);
		return state.oneShot;
	}

	return null;
}

export function parseToggleArgs(argsRaw: string): ToggleCommandAction {
	const trimmed = argsRaw.trim();
	if (!trimmed) {
		return { type: "toggle" };
	}

	const lower = trimmed.toLowerCase();
	if (lower === "on" || lower === "enable") {
		return { type: "enable" };
	}
	if (lower === "off" || lower === "disable") {
		return { type: "disable" };
	}

	return { type: "run", task: trimmed };
}

export function resolveOneShotTask(argsRaw: string, editorText = ""): { task: string; usedEditorDraft: boolean } | null {
	const trimmed = argsRaw.trim();
	if (trimmed) {
		return { task: trimmed, usedEditorDraft: false };
	}

	const draft = editorText.trim();
	if (draft) {
		return { task: draft, usedEditorDraft: true };
	}

	return null;
}

/** Custom message types written by legacy releases that injected hidden messages. */
const LEGACY_PROTOCOL_TYPES = new Set(["depth-protocol", "breadth-protocol", "horizon-protocol"]);

export default function soloWorkflowsExtension(pi: ExtensionAPI): void {
	let debugEnabled = false;
	let tddEnabled = false;
	let pendingOneShot: OneShotScenario | null = null;

	function persistDebugState(): void {
		pi.appendEntry("debug-state", { enabled: debugEnabled });
	}

	function persistTddState(): void {
		pi.appendEntry("tdd-state", { enabled: tddEnabled });
	}

	function updateStatus(ctx: ExtensionContext): void {
		const theme = ctx.ui?.theme;
		const formatBadge = (label: string) =>
			theme && typeof theme.fg === "function" ? theme.fg("accent", label) : label;

		ctx.ui.setStatus("debug", debugEnabled ? formatBadge("🔍 debug") : undefined);
		ctx.ui.setStatus("tdd", tddEnabled ? formatBadge("🧪 tdd") : undefined);
	}

	function setDebugEnabled(next: boolean, ctx: ExtensionContext, notify = true): void {
		debugEnabled = next;
		persistDebugState();
		updateStatus(ctx);
		if (notify) {
			ctx.ui.notify(
				debugEnabled
					? "Debug mode enabled (raw evidence + root-cause discipline + Outside Judge)."
					: "Debug mode disabled.",
				"info",
			);
		}
	}

	function setTddEnabled(next: boolean, ctx: ExtensionContext, notify = true): void {
		tddEnabled = next;
		persistTddState();
		updateStatus(ctx);
		if (notify) {
			ctx.ui.notify(
				tddEnabled
					? "TDD mode enabled (data shape first + pure boundaries + behavioral Red-Green-Refactor)."
					: "TDD mode disabled.",
				"info",
			);
		}
	}

	function dispatchUserTask(ctx: ExtensionContext, task: string): void {
		if (ctx.isIdle()) {
			pi.sendUserMessage(task);
		} else {
			pi.sendUserMessage(task, { deliverAs: "followUp" });
		}
	}

	function triggerOneShot(scenario: OneShotScenario, args: string, ctx: ExtensionContext): void {
		const editorDraft = typeof ctx.ui?.getEditorText === "function" ? ctx.ui.getEditorText() : "";
		const resolved = resolveOneShotTask(args, editorDraft);

		if (!resolved) {
			ctx.ui.notify(`Usage: /${scenario} <task> (or type a draft in the editor first)`, "warning");
			return;
		}

		if (resolved.usedEditorDraft && typeof ctx.ui?.setEditorText === "function") {
			ctx.ui.setEditorText("");
		}

		// Armed here, consumed by the very next run in before_agent_start.
		pendingOneShot = scenario;
		dispatchUserTask(ctx, resolved.task);
	}

	// Restore state on session start
	pi.on("session_start", async (event, ctx) => {
		const eventEntries = Array.isArray((event as any)?.entries) ? (event as any).entries : [];
		const managerEntries =
			typeof (ctx as any)?.sessionManager?.getEntries === "function"
				? (ctx as any).sessionManager.getEntries()
				: [];

		for (const entry of [...eventEntries, ...managerEntries]) {
			if (
				(entry?.customType === "debug-state" || entry?.customType === "depth-state") &&
				typeof entry.data?.enabled === "boolean"
			) {
				debugEnabled = entry.data.enabled;
			}
			if (entry?.customType === "tdd-state" && typeof entry.data?.enabled === "boolean") {
				tddEnabled = entry.data.enabled;
			}
		}

		updateStatus(ctx);
	});

	// Deliver protocols as system prompt sections for this request only
	pi.on("before_agent_start", async (event) => {
		const sections = event.systemPromptOptions.sections;
		const consumed = applyProtocolSections(sections, {
			debugEnabled,
			tddEnabled,
			oneShot: pendingOneShot,
		});
		if (consumed) {
			pendingOneShot = null;
		}
	});

	// Strip legacy hidden protocol messages so resumed sessions stay clean
	pi.on("context", async (event) => {
		let changed = false;
		const messages = event.messages.filter((m: any) => {
			if (!LEGACY_PROTOCOL_TYPES.has(m?.customType)) return true;
			const keep = m.customType === "depth-protocol" && debugEnabled;
			if (!keep) changed = true;
			return keep;
		});
		return changed ? { messages } : undefined;
	});

	// /debug command: persistent toggle, on/off, or enable + run task immediately
	pi.registerCommand("debug", {
		description:
			"Toggle Debug mode (or run `/debug <task>` with raw evidence framing, root-cause discipline & Outside Judge)",
		handler: async (args, ctx) => {
			const action = parseToggleArgs(args);

			if (action.type === "toggle") {
				setDebugEnabled(!debugEnabled, ctx);
				return;
			}
			if (action.type === "enable") {
				setDebugEnabled(true, ctx);
				return;
			}
			if (action.type === "disable") {
				setDebugEnabled(false, ctx);
				return;
			}

			if (!debugEnabled) {
				setDebugEnabled(true, ctx, false);
			}
			dispatchUserTask(ctx, action.task);
		},
	});

	// /tdd command: persistent toggle, on/off, or enable + run task immediately
	pi.registerCommand("tdd", {
		description:
			"Toggle TDD mode (or run `/tdd <task>` with data-shape-first design, pure boundaries & behavioral Red-Green-Refactor)",
		handler: async (args, ctx) => {
			const action = parseToggleArgs(args);

			if (action.type === "toggle") {
				setTddEnabled(!tddEnabled, ctx);
				return;
			}
			if (action.type === "enable") {
				setTddEnabled(true, ctx);
				return;
			}
			if (action.type === "disable") {
				setTddEnabled(false, ctx);
				return;
			}

			if (!tddEnabled) {
				setTddEnabled(true, ctx, false);
			}
			dispatchUserTask(ctx, action.task);
		},
	});

	// /explore command: one-shot system-prompt section for orthogonal exploration & repo-wide sweep
	pi.registerCommand("explore", {
		description: "Explore 3 orthogonal options/hypotheses, run fast disqualifiers, and sweep the repo",
		handler: async (args, ctx) => {
			triggerOneShot("explore", args, ctx);
		},
	});

	// /drive command: one-shot system-prompt section for end-to-end autonomous self-checking loops
	pi.registerCommand("drive", {
		description: "Drive a task end-to-end (define finish line & verifiable units, iterate until self-checks pass)",
		handler: async (args, ctx) => {
			triggerOneShot("drive", args, ctx);
		},
	});

	// /refactor command: one-shot system-prompt section for "Then Make it Right" cleanup
	pi.registerCommand("refactor", {
		description:
			"Refactor working code (pin behavioral tests, reduce CRAP < 10, eliminate duplication < 0.8, kill surviving mutants, delete dead code)",
		handler: async (args, ctx) => {
			triggerOneShot("refactor", args, ctx);
		},
	});

	// Alt+D shortcut: pure toggle for Debug mode
	pi.registerShortcut("alt+d", {
		description: "Toggle Debug mode on/off",
		handler: async (ctx) => {
			setDebugEnabled(!debugEnabled, ctx);
		},
	});

	// Alt+T shortcut: pure toggle for TDD mode
	pi.registerShortcut("alt+t", {
		description: "Toggle TDD mode on/off",
		handler: async (ctx) => {
			setTddEnabled(!tddEnabled, ctx);
		},
	});
}
