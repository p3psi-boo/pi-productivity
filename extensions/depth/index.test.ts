import { describe, expect, test } from "bun:test";
import depthExtension, {
	applyProtocolSections,
	buildBreadthProtocol,
	buildDepthProtocol,
	buildHorizonProtocol,
	parseDepthArgs,
	resolveOneShotTask,
} from "./index";

describe("parseDepthArgs & resolveOneShotTask", () => {
	test("toggles when /depth is called with no arguments", () => {
		expect(parseDepthArgs("")).toEqual({ type: "toggle" });
		expect(parseDepthArgs("   ")).toEqual({ type: "toggle" });
	});

	test("handles explicit on/off arguments for /depth", () => {
		expect(parseDepthArgs("on")).toEqual({ type: "enable" });
		expect(parseDepthArgs("enable")).toEqual({ type: "enable" });
		expect(parseDepthArgs("off")).toEqual({ type: "disable" });
		expect(parseDepthArgs("disable")).toEqual({ type: "disable" });
	});

	test("treats any other argument to /depth as a task to run", () => {
		expect(parseDepthArgs("optimize parser allocations")).toEqual({
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
	test("buildDepthProtocol includes 4-line framing and Outside Judge rules", () => {
		const protocol = buildDepthProtocol();
		expect(protocol).toContain("[Gap]");
		expect(protocol).toContain("[Raw]");
		expect(protocol).toContain("[Method]");
		expect(protocol).toContain("[Judge]");
		expect(protocol).toContain("Never grade your own homework");
	});

	test("buildBreadthProtocol includes 4-line framing for orthogonal options and repo sweep", () => {
		const protocol = buildBreadthProtocol();
		expect(protocol).toContain("[Space]");
		expect(protocol).toContain("[Disqualifier]");
		expect(protocol).toContain("[Sweep]");
		expect(protocol).toContain("[Pick]");
	});

	test("buildHorizonProtocol includes 4-line framing for finish line and self-check loop", () => {
		const protocol = buildHorizonProtocol();
		expect(protocol).toContain("[Finish Line]");
		expect(protocol).toContain("[Self-Check Loop]");
		expect(protocol).toContain("[Boundaries]");
		expect(protocol).toContain("[Stop Condition]");
	});
});

describe("applyProtocolSections", () => {
	test("writes the depth section only while depth is enabled", () => {
		const sections: Record<string, string> = {};

		applyProtocolSections(sections, { depthEnabled: true, oneShot: null });
		expect(sections.depth).toBe(buildDepthProtocol());

		applyProtocolSections(sections, { depthEnabled: false, oneShot: null });
		expect(sections.depth).toBeUndefined();
	});

	test("applies a one-shot section once and reports which one was consumed", () => {
		const sections: Record<string, string> = {};

		const consumed = applyProtocolSections(sections, { depthEnabled: false, oneShot: "breadth" });
		expect(consumed).toBe("breadth");
		expect(sections.breadth).toBe(buildBreadthProtocol());
		expect(sections.horizon).toBeUndefined();

		// Caller disarms; the next request carries no protocol section.
		applyProtocolSections(sections, { depthEnabled: false, oneShot: null });
		expect(sections.breadth).toBeUndefined();
		expect(sections.horizon).toBeUndefined();
	});

	test("keeps only one copy of the depth section across repeated requests", () => {
		const sections: Record<string, string> = {};

		for (let i = 0; i < 25; i++) {
			applyProtocolSections(sections, { depthEnabled: true, oneShot: null });
		}

		expect(Object.keys(sections)).toEqual(["depth"]);
		expect(sections.depth.split("[DEPTH MODE ACTIVE").length).toBe(2);
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

describe("depthExtension", () => {
	test("Alt+D and /depth toggle a persistent system prompt section", async () => {
		const pi = createMockPi();
		depthExtension(pi as never);
		const ctx = createMockContext();
		const sections: Record<string, string> = {};

		expect(await pi.handlers.before_agent_start[0](createBeforeAgentStartEvent(sections), ctx)).toBeUndefined();
		expect(sections.depth).toBeUndefined();

		// Toggle ON via Alt+D
		await pi.shortcuts["alt+d"].handler(ctx);
		expect(ctx.statusMap.depth).toBe("⛰️ depth");

		await pi.handlers.before_agent_start[0](createBeforeAgentStartEvent(sections), ctx);
		expect(sections.depth).toBe(buildDepthProtocol());

		// Toggle OFF via /depth: the section is removed on the next request
		await pi.commands.depth.handler("", ctx);
		expect(ctx.statusMap.depth).toBeUndefined();

		await pi.handlers.before_agent_start[0](createBeforeAgentStartEvent(sections), ctx);
		expect(sections.depth).toBeUndefined();
	});

	test("enabled depth never accumulates hidden messages in the transcript", async () => {
		const pi = createMockPi();
		depthExtension(pi as never);
		const ctx = createMockContext();
		const sections: Record<string, string> = {};

		await pi.commands.depth.handler("on", ctx);
		for (let i = 0; i < 10; i++) {
			await pi.handlers.before_agent_start[0](createBeforeAgentStartEvent(sections), ctx);
		}

		expect(pi.sentMessages).toHaveLength(0);
		expect(sections.depth.split("[DEPTH MODE ACTIVE").length).toBe(2);
	});

	test("/breadth and /horizon apply a one-shot section to the next run only", async () => {
		const pi = createMockPi();
		depthExtension(pi as never);
		const ctx = createMockContext(true);
		const sections: Record<string, string> = {};

		// 1. Trigger /breadth <task>
		await pi.commands.breadth.handler("why is websocket reconnecting", ctx);
		expect(pi.sentMessages).toHaveLength(0);
		expect(pi.sentUserMessages[0].content).toBe("why is websocket reconnecting");

		// The armed section lands on the run started by that task...
		await pi.handlers.before_agent_start[0](createBeforeAgentStartEvent(sections, "why is websocket reconnecting"), ctx);
		expect(sections.breadth).toBe(buildBreadthProtocol());

		// ...and the following turn carries nothing.
		await pi.handlers.before_agent_start[0](createBeforeAgentStartEvent(sections, "now rename that variable"), ctx);
		expect(sections.breadth).toBeUndefined();
		expect(sections.horizon).toBeUndefined();

		// 2. Trigger /horizon using editor draft text
		const draftCtx = createMockContext(true, "migrate all tests to bun:test");
		await pi.commands.horizon.handler("", draftCtx);
		expect(draftCtx.editorText).toBe("");
		expect(pi.sentUserMessages[1].content).toBe("migrate all tests to bun:test");

		await pi.handlers.before_agent_start[0](createBeforeAgentStartEvent(sections), draftCtx);
		expect(sections.horizon).toBe(buildHorizonProtocol());
		expect(sections.breadth).toBeUndefined();
	});

	test("one-shot framing works while depth stays enabled", async () => {
		const pi = createMockPi();
		depthExtension(pi as never);
		const ctx = createMockContext(true);
		const sections: Record<string, string> = {};

		await pi.commands.depth.handler("on", ctx);
		await pi.commands.breadth.handler("find the root cause", ctx);
		await pi.handlers.before_agent_start[0](createBeforeAgentStartEvent(sections), ctx);

		expect(sections.depth).toBe(buildDepthProtocol());
		expect(sections.breadth).toBe(buildBreadthProtocol());
	});

	test("restores enabled state from session_start entries", async () => {
		const pi = createMockPi();
		depthExtension(pi as never);
		const ctx = createMockContext();
		const sections: Record<string, string> = {};

		await pi.handlers.session_start[0](
			{ entries: [{ customType: "depth-state", data: { enabled: true } }] },
			ctx,
		);

		expect(ctx.statusMap.depth).toBe("⛰️ depth");

		await pi.handlers.before_agent_start[0](createBeforeAgentStartEvent(sections), ctx);
		expect(sections.depth).toBe(buildDepthProtocol());
	});

	test("strips legacy hidden protocol messages from resumed sessions", async () => {
		const pi = createMockPi();
		depthExtension(pi as never);
		const ctx = createMockContext();
		const ctxHandler = pi.handlers.context[0];

		// Depth disabled: legacy depth + one-shot protocols are dropped.
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

		// Depth enabled: a legacy depth message is kept, one-shots are still dropped.
		await pi.commands.depth.handler("on", ctx);
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
