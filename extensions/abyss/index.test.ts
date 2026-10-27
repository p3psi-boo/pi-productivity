import { describe, expect, test } from "bun:test";
import depthExtension, { buildDepthProtocol } from "../depth/index";
import abyssExtension, {
	ABYSS_SUBAGENT_PATHS,
	applyAbyssSections,
	buildImplProtocol,
	buildProposalProtocol,
	IMPL_REVIEW_ASPECTS,
	isSubagentManagerLoaded,
	mountSubagentManagerIfNeeded,
	parseAbyssCommandArgs,
	SUBAGENT_CAPABILITY_PROBE_CHANNEL,
} from "./index";

describe("parseAbyssCommandArgs", () => {
	test("parses proposal and impl subcommands with inline task", () => {
		expect(parseAbyssCommandArgs("proposal design a file-sharing service")).toEqual({
			type: "run",
			workflow: "proposal",
			task: "design a file-sharing service",
		});

		expect(parseAbyssCommandArgs("impl .context/proposals/260403-file-sharing.md")).toEqual({
			type: "run",
			workflow: "impl",
			task: ".context/proposals/260403-file-sharing.md",
		});
	});

	test("accepts workflow:proposal and workflow:impl prefixes", () => {
		expect(parseAbyssCommandArgs("workflow:proposal add download limits")).toEqual({
			type: "run",
			workflow: "proposal",
			task: "add download limits",
		});

		expect(parseAbyssCommandArgs("workflow:impl implement token expiry")).toEqual({
			type: "run",
			workflow: "impl",
			task: "implement token expiry",
		});
	});

	test("falls back to editor draft when only workflow name is given", () => {
		expect(parseAbyssCommandArgs("proposal", "draft from editor")).toEqual({
			type: "run",
			workflow: "proposal",
			task: "draft from editor",
		});
	});

	test("returns invalid action for missing task or unknown workflow", () => {
		expect(parseAbyssCommandArgs("proposal", "   ")).toEqual({
			type: "invalid",
			reason: "missing_task",
			workflow: "proposal",
		});
		expect(parseAbyssCommandArgs("")).toEqual({
			type: "invalid",
			reason: "unknown_workflow",
		});
		expect(parseAbyssCommandArgs("unknown task")).toEqual({
			type: "invalid",
			reason: "unknown_workflow",
		});
	});
});

describe("Abyss protocol builders", () => {
	test("buildProposalProtocol encodes Mei persona, anti-bloat rules, and clean-slate review subagent", () => {
		const protocol = buildProposalProtocol();
		expect(protocol).toContain("[ABYSS PROPOSAL WORKFLOW");
		expect(protocol).toContain("Persona Mei");
		expect(protocol).toContain(".context/proposals/YYMMDD-<slug>.md");
		expect(protocol).toContain(ABYSS_SUBAGENT_PATHS.proposalReviewer);
		expect(protocol).toContain("agent_spawn");
		expect(protocol).toContain("agent_stop");
		expect(protocol).toContain("overengineered");
	});

	test("buildImplProtocol encodes Coordinator rules, 1 implementer + 5 orthogonal reviewers, and P0-P3 loop", () => {
		const protocol = buildImplProtocol();
		expect(protocol).toContain("[ABYSS IMPL WORKFLOW");
		expect(protocol).toContain(ABYSS_SUBAGENT_PATHS.implementer);
		expect(protocol).toContain("Persona Elysia");
		expect(protocol).toContain("Persona Eden");
		expect(protocol).toContain("agent_steer");
		expect(protocol).toContain(".context/impl/YYMMDD-<slug>.md");

		expect(IMPL_REVIEW_ASPECTS).toHaveLength(5);
		for (const aspect of IMPL_REVIEW_ASPECTS) {
			expect(protocol).toContain(aspect.id);
			expect(protocol).toContain(aspect.path);
		}
	});
});

describe("applyAbyssSections", () => {
	test("applies proposal or impl section once and reports consumed workflow", () => {
		const sections: Record<string, string> = {};

		const consumed = applyAbyssSections(sections, { oneShot: "proposal", messageType: "user" });
		expect(consumed).toBe("proposal");
		expect(sections.proposal).toBe(buildProposalProtocol());
		expect(sections.impl).toBeUndefined();

		// Preserves section on custom subagent wake turns during the workflow
		expect(
			applyAbyssSections(sections, {
				oneShot: null,
				activeForCustomWake: "proposal",
				messageType: "custom",
			}),
		).toBeNull();
		expect(sections.proposal).toBe(buildProposalProtocol());

		// Clears on next normal user turn
		expect(
			applyAbyssSections(sections, {
				oneShot: null,
				activeForCustomWake: "proposal",
				messageType: "user",
			}),
		).toBeNull();
		expect(sections.proposal).toBeUndefined();
		expect(sections.impl).toBeUndefined();
	});
});

function createMockContext(idle = true, initialEditorText = "") {
	const notifications: Array<{ message: string; level: string }> = [];
	const statusMap: Record<string, string | undefined> = {};
	let editorText = initialEditorText;

	return {
		notifications,
		statusMap,
		get editorText() {
			return editorText;
		},
		isIdle: () => idle,
		ui: {
			notify: (message: string, level: string) => {
				notifications.push({ message, level });
			},
			setStatus: (key: string, value: string | undefined) => {
				statusMap[key] = value;
			},
			getEditorText: () => editorText,
			setEditorText: (next: string) => {
				editorText = next;
			},
			theme: {
				fg: (_color: string, text: string) => text,
			},
		},
	};
}

function createMockPi() {
	const commands: Record<string, { description?: string; handler: (args: string, ctx: any) => Promise<void> }> = {};
	const shortcuts: Record<string, { description?: string; handler: (ctx: any) => Promise<void> }> = {};
	const handlers: Record<string, Array<(event: any, ctx?: any) => Promise<any>>> = {};
	const sentUserMessages: Array<{ content: string; options?: any }> = [];
	const appendedEntries: Array<{ customType: string; data: any }> = [];

	return {
		commands,
		shortcuts,
		handlers,
		sentUserMessages,
		appendedEntries,
		registerCommand(name: string, options: any) {
			commands[name] = options;
		},
		registerShortcut(key: string, options: any) {
			shortcuts[key] = options;
		},
		on(event: string, handler: (ev: any, ctx?: any) => Promise<any>) {
			handlers[event] ??= [];
			handlers[event].push(handler);
			return () => {};
		},
		sendMessage() {},
		sendUserMessage(content: string, options?: any) {
			sentUserMessages.push({ content, options });
		},
		appendEntry(customType: string, data: any) {
			appendedEntries.push({ customType, data });
		},
	};
}

function createBeforeAgentStartEvent(
	sections: Record<string, string> = {},
	messageType: "user" | "custom" = "user",
) {
	return {
		type: "before_agent_start",
		messageType,
		prompt: "task",
		systemPrompt: "",
		systemPromptOptions: { sections },
	};
}

describe("abyssExtension", () => {
	test("/proposal and /impl arm one-shot sections, survive custom subagent wakes, and clear on next user turn", async () => {
		const pi = createMockPi();
		abyssExtension(pi as never);
		const ctx = createMockContext(true);
		const sections: Record<string, string> = {};

		// 1. Trigger /proposal <task>
		await pi.commands.proposal.handler("design file sharing service", ctx);
		expect(pi.sentUserMessages[0]).toEqual({
			content: "design file sharing service",
			options: undefined,
		});

		await pi.handlers.before_agent_start[0](createBeforeAgentStartEvent(sections, "user"), ctx);
		expect(sections.proposal).toBe(buildProposalProtocol());
		expect(sections.impl).toBeUndefined();

		// Subagent async wake turn (messageType === "custom") keeps the active workflow section
		await pi.handlers.before_agent_start[0](createBeforeAgentStartEvent(sections, "custom"), ctx);
		expect(sections.proposal).toBe(buildProposalProtocol());

		// Next user message clears the workflow section
		await pi.handlers.before_agent_start[0](createBeforeAgentStartEvent(sections, "user"), ctx);
		expect(sections.proposal).toBeUndefined();

		// 2. Trigger /impl using editor draft when busy
		const busyCtx = createMockContext(false, "implement .context/proposals/260403-sharing.md");
		await pi.commands.impl.handler("", busyCtx);
		expect(busyCtx.editorText).toBe("");
		expect(pi.sentUserMessages[1]).toEqual({
			content: "implement .context/proposals/260403-sharing.md",
			options: { deliverAs: "followUp" },
		});

		await pi.handlers.before_agent_start[0](createBeforeAgentStartEvent(sections, "user"), busyCtx);
		expect(sections.impl).toBe(buildImplProtocol());
		expect(sections.proposal).toBeUndefined();

		await pi.handlers.before_agent_start[0](createBeforeAgentStartEvent(sections, "user"), busyCtx);
		expect(sections.impl).toBeUndefined();
	});

	test("/abyss command dispatches proposal and impl workflows and validates usage", async () => {
		const pi = createMockPi();
		abyssExtension(pi as never);
		const ctx = createMockContext(true);
		const sections: Record<string, string> = {};

		await pi.commands.abyss.handler("", ctx);
		expect(ctx.notifications[0]?.message).toContain("Usage: /abyss <proposal|impl> <task>");

		await pi.commands.abyss.handler("proposal", ctx);
		expect(ctx.notifications[1]?.message).toContain("Usage: /abyss proposal <task>");

		await pi.commands.abyss.handler("workflow:impl add expiry check", ctx);
		expect(pi.sentUserMessages[0]?.content).toBe("add expiry check");

		await pi.handlers.before_agent_start[0](createBeforeAgentStartEvent(sections, "user"), ctx);
		expect(sections.impl).toBe(buildImplProtocol());
	});

	test("coexists cleanly with depthExtension on the same sections map", async () => {
		const pi = createMockPi();
		depthExtension(pi as never);
		abyssExtension(pi as never);
		const ctx = createMockContext(true);
		const sections: Record<string, string> = {};

		await pi.commands.depth.handler("on", ctx);
		await pi.commands.impl.handler("implement feature", ctx);

		for (const handler of pi.handlers.before_agent_start) {
			await handler(createBeforeAgentStartEvent(sections, "user"), ctx);
		}

		expect(sections.depth).toBe(buildDepthProtocol());
		expect(sections.impl).toBe(buildImplProtocol());
	});

	test("mountSubagentManagerIfNeeded mounts once and skips when capability probe responds", () => {
		const listeners = new Map<string, Array<(payload: any) => void>>();
		const pi = {
			...createMockPi(),
			events: {
				on(channel: string, fn: (payload: any) => void) {
					const list = listeners.get(channel) ?? [];
					list.push(fn);
					listeners.set(channel, list);
				},
				emit(channel: string, payload: any) {
					for (const fn of listeners.get(channel) ?? []) {
						fn(payload);
					}
				},
			},
		};

		let mountCount = 0;
		const fakeSubagentManager = (api: any) => {
			mountCount++;
			api.events.on(SUBAGENT_CAPABILITY_PROBE_CHANNEL, (payload: any) => {
				payload?.respond?.({ version: "1.1.0", protocol: 1 });
			});
		};

		expect(isSubagentManagerLoaded(pi)).toBe(false);
		expect(mountSubagentManagerIfNeeded(pi as never, fakeSubagentManager)).toBe(true);
		expect(mountCount).toBe(1);
		expect(isSubagentManagerLoaded(pi)).toBe(true);

		// Second call detects existing instance and skips duplicate mount
		expect(mountSubagentManagerIfNeeded(pi as never, fakeSubagentManager)).toBe(false);
		expect(mountCount).toBe(1);
	});
});
