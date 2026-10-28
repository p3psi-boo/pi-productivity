import { describe, expect, test } from "bun:test";
import soloWorkflowsExtension, {
	applyProtocolSections,
	buildDebugProtocol,
	buildDriveProtocol,
	buildExploreProtocol,
	buildRefactorProtocol,
	buildTddProtocol,
	parseToggleArgs,
	resolveOneShotTask,
} from "./index";

describe("parseToggleArgs & resolveOneShotTask", () => {
	test("toggles when /debug or /tdd is called with no arguments", () => {
		expect(parseToggleArgs("")).toEqual({ type: "toggle" });
		expect(parseToggleArgs("   ")).toEqual({ type: "toggle" });
	});

	test("handles explicit on/off arguments for toggle commands", () => {
		expect(parseToggleArgs("on")).toEqual({ type: "enable" });
		expect(parseToggleArgs("enable")).toEqual({ type: "enable" });
		expect(parseToggleArgs("off")).toEqual({ type: "disable" });
		expect(parseToggleArgs("disable")).toEqual({ type: "disable" });
	});

	test("treats any other argument to a toggle command as a task to run", () => {
		expect(parseToggleArgs("optimize parser allocations")).toEqual({
			type: "run",
			task: "optimize parser allocations",
		});
	});

	test("resolveOneShotTask uses inline args, falls back to editor draft, or returns null", () => {
		expect(resolveOneShotTask("audit auth token flow", "draft")).toEqual({
			task: "audit auth token flow",
			usedEditorDraft: false,
		});
		expect(resolveOneShotTask("", "fix flaky test across repo")).toEqual({
			task: "fix flaky test across repo",
			usedEditorDraft: true,
		});
		expect(resolveOneShotTask("  ", "   ")).toBeNull();
	});
});

describe("protocol builders", () => {
	test("buildDebugProtocol includes 4-line framing, root-cause discipline, Attack the Premise, and Outside Judge", () => {
		const protocol = buildDebugProtocol();
		expect(protocol).toContain("[Gap]");
		expect(protocol).toContain("[Raw]");
		expect(protocol).toContain("[Method]");
		expect(protocol).toContain("[Judge]");
		expect(protocol).toContain("Fix Root Causes");
		expect(protocol).toContain("Attack the Premise");
		expect(protocol).toContain("Never grade your own homework");
	});

	test("buildTddProtocol encodes First Make it Work (data shape, pure boundaries, subtract first, behavioral TDD)", () => {
		const protocol = buildTddProtocol();
		expect(protocol).toContain("[TDD MODE ACTIVE");
		expect(protocol).toContain("Get the data shape right before you write the logic");
		expect(protocol).toContain("Boundary Discipline");
		expect(protocol).toContain("Subtract Before You Add");
		expect(protocol).toContain("Test Behavior, Not Implementation");
	});

	test("buildExploreProtocol includes 4-line framing for orthogonal options, disqualifiers, and repo sweep", () => {
		const protocol = buildExploreProtocol();
		expect(protocol).toContain("[Space]");
		expect(protocol).toContain("[Disqualifier]");
		expect(protocol).toContain("[Sweep]");
		expect(protocol).toContain("[Pick]");
	});

	test("buildDriveProtocol includes 4-line framing, verifiable units, Build the Lever, and Attack the Premise", () => {
		const protocol = buildDriveProtocol();
		expect(protocol).toContain("[Finish Line]");
		expect(protocol).toContain("[Self-Check Loop]");
		expect(protocol).toContain("[Boundaries]");
		expect(protocol).toContain("[Stop Condition]");
		expect(protocol).toContain("Sequence Work into Verifiable Units");
		expect(protocol).toContain("Build the Lever");
	});

	test("buildRefactorProtocol encodes Then Make it Right (Pin, CRAP < 10, Duplication < 0.8, Mutation Gate)", () => {
		const protocol = buildRefactorProtocol();
		expect(protocol).toContain("[Pin]");
		expect(protocol).toContain("[Hotspots]");
		expect(protocol).toContain("[Mutations]");
		expect(protocol).toContain("[Proof]");
		expect(protocol).toContain("CRAP < 10");
		expect(protocol).toContain("Duplication Gate");
		expect(protocol).toContain("Mutation Gate");
	});
});

describe("applyProtocolSections", () => {
	test("writes debug and tdd sections independently while enabled", () => {
		const sections: Record<string, string> = {};

		applyProtocolSections(sections, { debugEnabled: true, tddEnabled: false, oneShot: null });
		expect(sections.debug).toBe(buildDebugProtocol());
		expect(sections.tdd).toBeUndefined();

		applyProtocolSections(sections, { debugEnabled: true, tddEnabled: true, oneShot: null });
		expect(sections.debug).toBe(buildDebugProtocol());
		expect(sections.tdd).toBe(buildTddProtocol());

		applyProtocolSections(sections, { debugEnabled: false, tddEnabled: false, oneShot: null });
		expect(sections.debug).toBeUndefined();
		expect(sections.tdd).toBeUndefined();
	});

	test("applies a one-shot section once and reports which scenario was consumed", () => {
		const sections: Record<string, string> = {};

		const consumed = applyProtocolSections(sections, {
			debugEnabled: false,
			tddEnabled: false,
			oneShot: "refactor",
		});
		expect(consumed).toBe("refactor");
		expect(sections.refactor).toBe(buildRefactorProtocol());
		expect(sections.explore).toBeUndefined();
		expect(sections.drive).toBeUndefined();

		// Caller disarms; the next request carries no one-shot section.
		applyProtocolSections(sections, { debugEnabled: false, tddEnabled: false, oneShot: null });
		expect(sections.refactor).toBeUndefined();
		expect(sections.explore).toBeUndefined();
		expect(sections.drive).toBeUndefined();
	});

	test("keeps only one copy of persistent toggle sections across repeated requests", () => {
		const sections: Record<string, string> = {};

		for (let i = 0; i < 25; i++) {
			applyProtocolSections(sections, { debugEnabled: true, tddEnabled: true, oneShot: null });
		}

		expect(Object.keys(sections).sort()).toEqual(["debug", "tdd"]);
		expect(sections.debug.split("[DEBUG MODE ACTIVE").length).toBe(2);
		expect(sections.tdd.split("[TDD MODE ACTIVE").length).toBe(2);
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
	const sentMessages: Array<{ message: any; options?: any }> = [];
	const sentUserMessages: Array<{ content: string; options?: any }> = [];
	const appendedEntries: Array<{ customType: string; data: any }> = [];

	return {
		commands,
		shortcuts,
		handlers,
		sentMessages,
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
		sendMessage(message: any, options?: any) {
			sentMessages.push({ message, options });
		},
		sendUserMessage(content: string, options?: any) {
			sentUserMessages.push({ content, options });
		},
		appendEntry(customType: string, data: any) {
			appendedEntries.push({ customType, data });
		},
	};
}

/** Minimal before_agent_start event with a mutable sections map. */
function createBeforeAgentStartEvent(sections: Record<string, string> = {}, prompt = "task") {
	return {
		type: "before_agent_start",
		messageType: "user",
		prompt,
		systemPrompt: "",
		systemPromptOptions: { sections },
	};
}

describe("soloWorkflowsExtension", () => {
	test("Alt+D (/debug) and Alt+T (/tdd) toggle persistent system prompt sections independently", async () => {
		const pi = createMockPi();
		soloWorkflowsExtension(pi as never);
		const ctx = createMockContext();
		const sections: Record<string, string> = {};

		expect(await pi.handlers.before_agent_start[0](createBeforeAgentStartEvent(sections), ctx)).toBeUndefined();
		expect(sections.debug).toBeUndefined();
		expect(sections.tdd).toBeUndefined();

		// Toggle Debug ON via Alt+D
		await pi.shortcuts["alt+d"].handler(ctx);
		expect(ctx.statusMap.debug).toBe("🔍 debug");

		// Toggle TDD ON via Alt+T
		await pi.shortcuts["alt+t"].handler(ctx);
		expect(ctx.statusMap.tdd).toBe("🧪 tdd");

		await pi.handlers.before_agent_start[0](createBeforeAgentStartEvent(sections), ctx);
		expect(sections.debug).toBe(buildDebugProtocol());
		expect(sections.tdd).toBe(buildTddProtocol());

		// Toggle Debug OFF via /debug
		await pi.commands.debug.handler("", ctx);
		expect(ctx.statusMap.debug).toBeUndefined();
		expect(ctx.statusMap.tdd).toBe("🧪 tdd");

		await pi.handlers.before_agent_start[0](createBeforeAgentStartEvent(sections), ctx);
		expect(sections.debug).toBeUndefined();
		expect(sections.tdd).toBe(buildTddProtocol());

		// Toggle TDD OFF via /tdd off
		await pi.commands.tdd.handler("off", ctx);
		expect(ctx.statusMap.tdd).toBeUndefined();

		await pi.handlers.before_agent_start[0](createBeforeAgentStartEvent(sections), ctx);
		expect(sections.tdd).toBeUndefined();
	});

	test("/debug <task> and /tdd <task> enable the mode and immediately dispatch the task", async () => {
		const pi = createMockPi();
		soloWorkflowsExtension(pi as never);
		const ctx = createMockContext();
		const sections: Record<string, string> = {};

		await pi.commands.tdd.handler("implement token bucket rate limiter", ctx);
		expect(ctx.statusMap.tdd).toBe("🧪 tdd");
		expect(pi.sentUserMessages[0].content).toBe("implement token bucket rate limiter");

		await pi.handlers.before_agent_start[0](createBeforeAgentStartEvent(sections), ctx);
		expect(sections.tdd).toBe(buildTddProtocol());
	});

	test("enabled toggles never accumulate hidden messages in the transcript", async () => {
		const pi = createMockPi();
		soloWorkflowsExtension(pi as never);
		const ctx = createMockContext();
		const sections: Record<string, string> = {};

		await pi.commands.debug.handler("on", ctx);
		await pi.commands.tdd.handler("on", ctx);
		for (let i = 0; i < 10; i++) {
			await pi.handlers.before_agent_start[0](createBeforeAgentStartEvent(sections), ctx);
		}

		expect(pi.sentMessages).toHaveLength(0);
		expect(sections.debug.split("[DEBUG MODE ACTIVE").length).toBe(2);
		expect(sections.tdd.split("[TDD MODE ACTIVE").length).toBe(2);
	});

	test("/explore, /drive, and /refactor apply a one-shot section to the next run only", async () => {
		const pi = createMockPi();
		soloWorkflowsExtension(pi as never);
		const ctx = createMockContext(true);
		const sections: Record<string, string> = {};

		// 1. Trigger /explore <task>
		await pi.commands.explore.handler("why is websocket reconnecting", ctx);
		expect(pi.sentMessages).toHaveLength(0);
		expect(pi.sentUserMessages[0].content).toBe("why is websocket reconnecting");

		await pi.handlers.before_agent_start[0](
			createBeforeAgentStartEvent(sections, "why is websocket reconnecting"),
			ctx,
		);
		expect(sections.explore).toBe(buildExploreProtocol());

		// Next turn carries no one-shot section
		await pi.handlers.before_agent_start[0](
			createBeforeAgentStartEvent(sections, "now rename that variable"),
			ctx,
		);
		expect(sections.explore).toBeUndefined();
		expect(sections.drive).toBeUndefined();
		expect(sections.refactor).toBeUndefined();

		// 2. Trigger /drive using editor draft text
		const draftCtx = createMockContext(true, "migrate all tests to bun:test");
		await pi.commands.drive.handler("", draftCtx);
		expect(draftCtx.editorText).toBe("");
		expect(pi.sentUserMessages[1].content).toBe("migrate all tests to bun:test");

		await pi.handlers.before_agent_start[0](createBeforeAgentStartEvent(sections), draftCtx);
		expect(sections.drive).toBe(buildDriveProtocol());
		expect(sections.explore).toBeUndefined();

		// 3. Trigger /refactor <task>
		await pi.commands.refactor.handler("clean up auth session module", ctx);
		expect(pi.sentUserMessages[2].content).toBe("clean up auth session module");

		await pi.handlers.before_agent_start[0](createBeforeAgentStartEvent(sections), ctx);
		expect(sections.refactor).toBe(buildRefactorProtocol());
		expect(sections.drive).toBeUndefined();
	});

	test("one-shot scenarios compose cleanly while debug and tdd toggles stay enabled", async () => {
		const pi = createMockPi();
		soloWorkflowsExtension(pi as never);
		const ctx = createMockContext(true);
		const sections: Record<string, string> = {};

		await pi.commands.debug.handler("on", ctx);
		await pi.commands.tdd.handler("on", ctx);
		await pi.commands.explore.handler("find the root cause", ctx);
		await pi.handlers.before_agent_start[0](createBeforeAgentStartEvent(sections), ctx);

		expect(sections.debug).toBe(buildDebugProtocol());
		expect(sections.tdd).toBe(buildTddProtocol());
		expect(sections.explore).toBe(buildExploreProtocol());
	});

	test("restores debug and tdd state from session_start entries", async () => {
		const pi = createMockPi();
		soloWorkflowsExtension(pi as never);
		const ctx = createMockContext();
		const sections: Record<string, string> = {};

		await pi.handlers.session_start[0](
			{
				entries: [
					{ customType: "debug-state", data: { enabled: true } },
					{ customType: "tdd-state", data: { enabled: true } },
				],
			},
			ctx,
		);

		expect(ctx.statusMap.debug).toBe("🔍 debug");
		expect(ctx.statusMap.tdd).toBe("🧪 tdd");

		await pi.handlers.before_agent_start[0](createBeforeAgentStartEvent(sections), ctx);
		expect(sections.debug).toBe(buildDebugProtocol());
		expect(sections.tdd).toBe(buildTddProtocol());
	});

	test("strips legacy hidden protocol messages from resumed sessions", async () => {
		const pi = createMockPi();
		soloWorkflowsExtension(pi as never);
		const ctx = createMockContext();
		const ctxHandler = pi.handlers.context[0];

		const stripped = await ctxHandler(
			{
				messages: [
					{ role: "user", content: "hello" },
					{ customType: "depth-protocol", content: "stale" },
					{ customType: "breadth-protocol", content: "stale" },
				],
			},
			ctx,
		);
		expect(stripped.messages).toEqual([{ role: "user", content: "hello" }]);

		await pi.commands.debug.handler("on", ctx);
		const kept = await ctxHandler(
			{
				messages: [
					{ customType: "depth-protocol", content: "legacy" },
					{ customType: "horizon-protocol", content: "stale" },
				],
			},
			ctx,
		);
		expect(kept.messages).toEqual([{ customType: "depth-protocol", content: "legacy" }]);
	});
});
