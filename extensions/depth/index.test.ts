import { describe, expect, test } from "bun:test";
import depthExtension, {
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

describe("depthExtension", () => {
	test("Alt+D and /depth toggle persistent Depth mode on and off", async () => {
		const pi = createMockPi();
		depthExtension(pi as never);
		const ctx = createMockContext();

		expect(await pi.handlers.before_agent_start[0]({}, ctx)).toBeUndefined();

		// Toggle ON via Alt+D
		await pi.shortcuts["alt+d"].handler(ctx);
		expect(ctx.statusMap.depth).toBe("⛰️ depth");

		const injected = await pi.handlers.before_agent_start[0]({}, ctx);
		expect(injected?.message?.customType).toBe("depth-protocol");
		expect(injected?.message?.display).toBe(false);

		// Toggle OFF via /depth
		await pi.commands.depth.handler("", ctx);
		expect(ctx.statusMap.depth).toBeUndefined();
		expect(await pi.handlers.before_agent_start[0]({}, ctx)).toBeUndefined();

		// Context handler strips stale depth-protocol messages when disabled
		const filtered = await pi.handlers.context[0]({
			messages: [
				{ role: "user", content: "hello" },
				{ customType: "depth-protocol", content: "stale" },
			],
		});
		expect(filtered.messages).toEqual([{ role: "user", content: "hello" }]);
	});

	test("/breadth and /horizon inject hidden one-shot protocols and auto-expire on agent_end", async () => {
		const pi = createMockPi();
		depthExtension(pi as never);
		const ctx = createMockContext(true);

		// 1. Trigger /breadth <task>
		await pi.commands.breadth.handler("why is websocket reconnecting", ctx);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0].message.customType).toBe("breadth-protocol");
		expect(pi.sentMessages[0].message.display).toBe(false);
		expect(pi.sentUserMessages[0].content).toBe("why is websocket reconnecting");

		// While the current agent run is active, breadth-protocol stays in context
		const duringRun = await pi.handlers.context[0]({
			messages: [
				{ customType: "breadth-protocol", content: buildBreadthProtocol() },
				{ role: "user", content: "why is websocket reconnecting" },
			],
		});
		expect(duringRun.messages).toHaveLength(2);

		// Once agent_end fires, breadth-protocol is stripped on subsequent turns
		await pi.handlers.agent_end[0]({}, ctx);
		const afterRun = await pi.handlers.context[0]({
			messages: [
				{ customType: "breadth-protocol", content: buildBreadthProtocol() },
				{ role: "user", content: "why is websocket reconnecting" },
				{ role: "user", content: "now rename that variable" },
			],
		});
		expect(afterRun.messages).toEqual([
			{ role: "user", content: "why is websocket reconnecting" },
			{ role: "user", content: "now rename that variable" },
		]);

		// 2. Trigger /horizon using editor draft text
		const draftCtx = createMockContext(true, "migrate all tests to bun:test");
		await pi.commands.horizon.handler("", draftCtx);
		expect(draftCtx.editorText).toBe("");
		expect(pi.sentMessages[1].message.customType).toBe("horizon-protocol");
		expect(pi.sentUserMessages[1].content).toBe("migrate all tests to bun:test");
	});

	test("restores enabled state from session_start entries", async () => {
		const pi = createMockPi();
		depthExtension(pi as never);
		const ctx = createMockContext();

		await pi.handlers.session_start[0](
			{ entries: [{ customType: "depth-state", data: { enabled: true } }] },
			ctx,
		);

		expect(ctx.statusMap.depth).toBe("⛰️ depth");
	});
});
