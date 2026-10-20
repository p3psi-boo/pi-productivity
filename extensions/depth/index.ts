/**
 * Ambition Extension — Depth (Toggle) + Breadth & Horizon (One-Shot Prompts)
 *
 * Operationalizes the three dimensions from Felix Rieseberg's
 * "How to be more ambitious: A tutorial for humans with models":
 *
 * 1. Depth (`Alt+D` or `/depth` persistent toggle):
 *    Multi-turn quality bar — inspect rawest material, 4-line framing
 *    ([Gap], [Raw], [Method], [Judge]), and run an Outside Judge via bash.
 * 2. Breadth (`/breadth <task>` one-shot hidden prompt):
 *    Explore 3 orthogonal hypotheses/approaches ([Space], [Disqualifier],
 *    [Sweep], [Pick]), run fast disqualifiers, and sweep the whole repo.
 *    Automatically expires after the current agent run finishes.
 * 3. Horizon (`/horizon <task>` one-shot hidden prompt):
 *    Autonomous end-to-end loop ([Finish Line], [Self-Check Loop],
 *    [Boundaries], [Stop Condition]) — iterate until verified without
 *    stopping halfway to ask permission. Automatically expires on agent_end.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

export type DepthCommandAction =
	| { type: "toggle" }
	| { type: "enable" }
	| { type: "disable" }
	| { type: "run"; task: string };

export type OneShotDimension = "breadth" | "horizon";

export const DEPTH_PROTOCOL_RULES = [
	"[DEPTH MODE ACTIVE — Switch methods, not just vocabulary]",
	"Before proposing or editing anything, inspect the rawest material in the workspace (actual source files, logs, ASTs, traces, or test fixtures) using read/bash. Never guess from surface summaries.",
	"After initial inspection, start your response with this exact 4-line framing block:",
	"  [Gap] What a field-leading expert would examine here that the user's prompt omitted.",
	"  [Raw] The exact raw files, traces, or data sources you inspected.",
	"  [Method] The concrete instrument or method you are using (e.g., rg, ast-grep, profiler, benchmark, property test) instead of hand-wavy review.",
	"  [Judge] The exact shell command that acts as the Outside Judge to falsify or verify the result.",
	"Execution rules:",
	"- Do NOT stop and ask for approval after the 4-line block; proceed directly to implementation or deep analysis.",
	"- Challenge at least one default assumption in the existing code or prompt.",
	"- Never grade your own homework: run the [Judge] command via bash before finishing and report the real output.",
];

export const BREADTH_PROTOCOL_RULES = [
	"[BREADTH MODE — Explore the space before committing; sweep the whole surface]",
	"Do NOT lock onto your first hypothesis or patch a single isolated spot.",
	"After initial inspection of the codebase, start your response with this exact 4-line framing block:",
	"  [Space] 3 genuinely different approaches or root-cause hypotheses (different mechanisms, not minor variations).",
	"  [Disqualifier] The fastest concrete check or evidence that would rule each option out.",
	"  [Sweep] How to scan the entire repository (via rg/ast-grep) for all sibling occurrences of this pattern or bug.",
	"  [Pick] Which option wins after running the disqualifier checks, and why.",
	"Execution rules:",
	"- Run the cheap disqualifier checks via read/bash BEFORE writing production changes.",
	"- If fixing a class of bug or pattern, audit and fix all matching instances across the codebase (or explicitly list any skipped).",
];

export const HORIZON_PROTOCOL_RULES = [
	"[HORIZON MODE — Define the finish line and run the loop until it passes]",
	"Treat this task as an end-to-end autonomous mission, not a single conversational turn.",
	"After inspecting the workspace, start your response with this exact 4-line framing block:",
	"  [Finish Line] The exact observable end state that means the entire task is 100% done.",
	"  [Self-Check Loop] The exact command(s) (test, build, typecheck, repro script) you will run after each change to verify progress.",
	"  [Boundaries] Files/interfaces in scope vs. off-limits, and what edge cases must be covered.",
	"  [Stop Condition] The only conditions under which you will pause to ask the user (e.g., destructive action or ambiguous product choice).",
	"Execution rules:",
	"- Do NOT stop partway to ask 'Should I proceed?' or hand back unverified work.",
	"- Work in an iterative [Edit -> Run Self-Check -> Read Failure -> Fix] loop until the [Finish Line] passes cleanly.",
	"- If an approach fails twice, switch approaches rather than repeating the same fix.",
];

export function buildDepthProtocol(): string {
	return DEPTH_PROTOCOL_RULES.join("\n");
}

export function buildBreadthProtocol(): string {
	return BREADTH_PROTOCOL_RULES.join("\n");
}

export function buildHorizonProtocol(): string {
	return HORIZON_PROTOCOL_RULES.join("\n");
}

export function parseDepthArgs(argsRaw: string): DepthCommandAction {
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

export default function depthExtension(pi: ExtensionAPI): void {
	let enabled = false;
	let activeOneShot: OneShotDimension | null = null;

	function persistState(): void {
		pi.appendEntry("depth-state", { enabled });
	}

	function updateStatus(ctx: ExtensionContext): void {
		const theme = ctx.ui?.theme;
		const badge = theme && typeof theme.fg === "function" ? theme.fg("accent", "⛰️ depth") : "⛰️ depth";
		ctx.ui.setStatus("depth", enabled ? badge : undefined);
	}

	function setEnabled(next: boolean, ctx: ExtensionContext, notify = true): void {
		enabled = next;
		persistState();
		updateStatus(ctx);
		if (notify) {
			ctx.ui.notify(
				enabled
					? "Depth mode enabled (4-line framing + Outside Judge verification)."
					: "Depth mode disabled.",
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

	function triggerOneShot(dimension: OneShotDimension, args: string, ctx: ExtensionContext): void {
		const editorDraft = typeof ctx.ui?.getEditorText === "function" ? ctx.ui.getEditorText() : "";
		const resolved = resolveOneShotTask(args, editorDraft);

		if (!resolved) {
			ctx.ui.notify(`Usage: /${dimension} <task> (or type a draft in the editor first)`, "warning");
			return;
		}

		if (resolved.usedEditorDraft && typeof ctx.ui?.setEditorText === "function") {
			ctx.ui.setEditorText("");
		}

		activeOneShot = dimension;
		pi.sendMessage({
			customType: `${dimension}-protocol`,
			content: dimension === "breadth" ? buildBreadthProtocol() : buildHorizonProtocol(),
			display: false,
		});

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
			if (entry?.customType === "depth-state" && typeof entry.data?.enabled === "boolean") {
				enabled = entry.data.enabled;
			}
		}

		updateStatus(ctx);
	});

	// Inject the Depth Protocol when Depth toggle is enabled
	pi.on("before_agent_start", async () => {
		if (!enabled) return;

		return {
			message: {
				customType: "depth-protocol",
				content: buildDepthProtocol(),
				display: false,
			},
		};
	});

	// Expire one-shot Breadth/Horizon protocol after the agent finishes the run
	pi.on("agent_end", async () => {
		activeOneShot = null;
	});

	// Strip inactive protocol messages so they never pollute subsequent turns
	pi.on("context", async (event) => {
		return {
			messages: event.messages.filter((m: any) => {
				if (m.customType === "depth-protocol" && !enabled) return false;
				if (m.customType === "breadth-protocol" && activeOneShot !== "breadth") return false;
				if (m.customType === "horizon-protocol" && activeOneShot !== "horizon") return false;
				return true;
			}),
		};
	});

	// /depth command: persistent toggle, on/off, or enable + run task immediately
	pi.registerCommand("depth", {
		description: "Toggle Depth mode (or run `/depth <task>` with expert framing & Outside Judge verification)",
		handler: async (args, ctx) => {
			const action = parseDepthArgs(args);

			if (action.type === "toggle") {
				setEnabled(!enabled, ctx);
				return;
			}

			if (action.type === "enable") {
				setEnabled(true, ctx);
				return;
			}

			if (action.type === "disable") {
				setEnabled(false, ctx);
				return;
			}

			if (!enabled) {
				setEnabled(true, ctx, false);
			}

			dispatchUserTask(ctx, action.task);
		},
	});

	// /breadth command: one-shot hidden prompt for orthogonal exploration & repo-wide sweep
	pi.registerCommand("breadth", {
		description: "Run a task with Breadth framing (explore 3 orthogonal options, run disqualifiers, sweep repo)",
		handler: async (args, ctx) => {
			triggerOneShot("breadth", args, ctx);
		},
	});

	// /horizon command: one-shot hidden prompt for end-to-end autonomous self-checking loops
	pi.registerCommand("horizon", {
		description: "Run a task with Horizon framing (define finish line & self-check loop, iterate until done)",
		handler: async (args, ctx) => {
			triggerOneShot("horizon", args, ctx);
		},
	});

	// Alt+D shortcut: pure toggle for Depth mode (never clobbers editor draft text)
	pi.registerShortcut("alt+d", {
		description: "Toggle Depth mode on/off",
		handler: async (ctx) => {
			setEnabled(!enabled, ctx);
		},
	});
}
