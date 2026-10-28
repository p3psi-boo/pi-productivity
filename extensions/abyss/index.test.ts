import { describe, expect, test } from "bun:test";
import soloWorkflowsExtension, { buildDebugProtocol, buildTddProtocol } from "../depth/index";
import orchestratedWorkflowsExtension, {
	applyOrchestratedSections,
	buildDeliverProtocol,
	buildDesignProtocol,
	DELIVER_REVIEW_ASPECTS,
	isSubagentManagerLoaded,
	mountSubagentManagerIfNeeded,
	parseOrchestratedCommandArgs,
	SUBAGENT_CAPABILITY_PROBE_CHANNEL,
	SUBAGENT_PATHS,
} from "./index";

describe("parseOrchestratedCommandArgs", () => {
	test("parses design and deliver subcommands with inline task", () => {
		expect(parseOrchestratedCommandArgs("design a file-sharing service")).toEqual({
			type: "run",
			workflow: "design",
			task: "a file-sharing service",
		});

		expect(parseOrchestratedCommandArgs("deliver .context/proposals/260403-file-sharing.md")).toEqual({
			type: "run",
			workflow: "deliver",
			task: ".context/proposals/260403-file-sharing.md",
		});
	});

	test("accepts workflow:design and workflow:deliver prefixes", () => {
		expect(parseOrchestratedCommandArgs("workflow:design add download limits")).toEqual({
			type: "run",
			workflow: "design",
			task: "add download limits",
		});

		expect(parseOrchestratedCommandArgs("workflow:deliver implement token expiry")).toEqual({
			type: "run",
			workflow: "deliver",
			task: "implement token expiry",
		});
	});

	test("falls back to editor draft when only workflow name is given", () => {
		expect(parseOrchestratedCommandArgs("design", "draft from editor")).toEqual({
			type: "run",
			workflow: "design",
			task: "draft from editor",
		});
	});

	test("returns invalid action for missing task or unknown workflow", () => {
		expect(parseOrchestratedCommandArgs("design", "   ")).toEqual({
			type: "invalid",
			reason: "missing_task",
			workflow: "design",
		});
		expect(parseOrchestratedCommandArgs("")).toEqual({
			type: "invalid",
			reason: "unknown_workflow",
		});
		expect(parseOrchestratedCommandArgs("unknown task")).toEqual({
			type: "invalid",
			reason: "unknown_workflow",
		});
	});
});

describe("Orchestrated protocol builders", () => {
	test("buildDesignProtocol encodes Foundational Thinking, domain architecture, and clean-slate complexity review", () => {
		const protocol = buildDesignProtocol();
		expect(protocol).toContain("[DESIGN WORKFLOW");
		expect(protocol).toContain("Persona Mei");
		expect(protocol).toContain("Get the data shape right before logic");
		expect(protocol).toContain("Subtract Before You Add");
		expect(protocol).toContain("Laziness Protocol");
		expect(protocol).toContain(".context/proposals/YYMMDD-<slug>.md");
		expect(protocol).toContain(SUBAGENT_PATHS.designReviewer);
		expect(protocol).toContain("agent_spawn");
		expect(protocol).toContain("agent_stop");
	});

	test("buildDeliverProtocol encodes Coordinator rules, First Make it Work implementer, and 5 Then Make it Right reviewers", () => {
		const protocol = buildDeliverProtocol();
		expect(protocol).toContain("[DELIVER WORKFLOW");
		expect(protocol).toContain(SUBAGENT_PATHS.implementer);
		expect(protocol).toContain("First Make it Work");
		expect(protocol).toContain("CRAP 10");
		expect(protocol).toContain("structural duplication");
		expect(protocol).toContain("Test Behavior, Not Implementation");
		expect(protocol).toContain("surviving mutants");
		expect(protocol).toContain("agent_steer");
		expect(protocol).toContain(".context/impl/YYMMDD-<slug>.md");

		expect(DELIVER_REVIEW_ASPECTS).toHaveLength(5);
		for (const aspect of DELIVER_REVIEW_ASPECTS) {
			expect(protocol).toContain(aspect.id);
			expect(protocol).toContain(aspect.path);
		}
	});
});

describe("applyOrchestratedSections", () => {
	test("applies design or deliver section once and reports consumed workflow", () => {
		const sections: Record<string, string> = {};

		const consumed = applyOrchestratedSections(sections, { oneShot: "design", messageType: "user" });
		expect(consumed).toBe("design");
		expect(sections.design).toBe(buildDesignProtocol());
		expect(sections.deliver).toBeUndefined();

		// Preserves section on custom subagent wake turns during the workflow
		expect(
			applyOrchestratedSections(sections, {
				oneShot: null,
				activeForCustomWake: "design",
				messageType: "custom",
			}),
		).toBeNull();
		expect(sections.design).toBe(buildDesignProtocol());

		// Clears on next normal user turn
		expect(
			applyOrchestratedSections(sections, {
				oneShot: null,
				activeForCustomWake: "design",
				messageType: "user",
			}),
		).toBeNull();
		expect(sections.design).toBeUndefined();
		expect(sections.deliver).toBeUndefined();
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

describe("orchestratedWorkflowsExtension", () => {
	test("/design and /deliver arm one-shot sections, survive custom subagent wakes, and clear on next user turn", async () => {
		const pi = createMockPi();
		orchestratedWorkflowsExtension(pi as never);
		const ctx = createMockContext(true);
		const sections: Record<string, string> = {};

		// 1. Trigger /design <task>
		await pi.commands.design.handler("design file sharing service", ctx);
		expect(pi.sentUserMessages[0]).toEqual({
			content: "design file sharing service",
			options: undefined,
		});

		await pi.handlers.before_agent_start[0](createBeforeAgentStartEvent(sections, "user"), ctx);
		expect(sections.design).toBe(buildDesignProtocol());
		expect(sections.deliver).toBeUndefined();

		// Subagent async wake turn (messageType === "custom") keeps the active workflow section
		await pi.handlers.before_agent_start[0](createBeforeAgentStartEvent(sections, "custom"), ctx);
		expect(sections.design).toBe(buildDesignProtocol());

		// Next user message clears the workflow section
		await pi.handlers.before_agent_start[0](createBeforeAgentStartEvent(sections, "user"), ctx);
		expect(sections.design).toBeUndefined();

		// 2. Trigger /deliver using editor draft when busy
		const busyCtx = createMockContext(false, "implement .context/proposals/260403-sharing.md");
		await pi.commands.deliver.handler("", busyCtx);
		expect(busyCtx.editorText).toBe("");
		expect(pi.sentUserMessages[1]).toEqual({
			content: "implement .context/proposals/260403-sharing.md",
			options: { deliverAs: "followUp" },
		});

		await pi.handlers.before_agent_start[0](createBeforeAgentStartEvent(sections, "user"), busyCtx);
		expect(sections.deliver).toBe(buildDeliverProtocol());
		expect(sections.design).toBeUndefined();

		await pi.handlers.before_agent_start[0](createBeforeAgentStartEvent(sections, "user"), busyCtx);
		expect(sections.deliver).toBeUndefined();
	});

	test("coexists cleanly with soloWorkflowsExtension on the same sections map", async () => {
		const pi = createMockPi();
		soloWorkflowsExtension(pi as never);
		orchestratedWorkflowsExtension(pi as never);
		const ctx = createMockContext(true);
		const sections: Record<string, string> = {};

		await pi.commands.debug.handler("on", ctx);
		await pi.commands.tdd.handler("on", ctx);
		await pi.commands.deliver.handler("implement feature", ctx);

		for (const handler of pi.handlers.before_agent_start) {
			await handler(createBeforeAgentStartEvent(sections, "user"), ctx);
		}

		expect(sections.debug).toBe(buildDebugProtocol());
		expect(sections.tdd).toBe(buildTddProtocol());
		expect(sections.deliver).toBe(buildDeliverProtocol());
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
