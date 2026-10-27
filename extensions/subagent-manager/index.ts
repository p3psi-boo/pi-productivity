/**
 * Bundled `pi-subagent-manager` Bridge Extension
 *
 * Automatically registers `pi-subagent-manager` (`agent_types`, `agent_spawn`,
 * `agent_steer`, `agent_wait`, `agent_stop`, `agent_status`, `agent_output`,
 * and `/agents`) when `pi-productivity` is installed, while skipping duplicate
 * registration if a standalone `npm:pi-subagent-manager` package was already
 * loaded earlier in the session.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import piSubagent from "pi-subagent-manager/src/index.ts";
import { mountSubagentManagerIfNeeded } from "../abyss/index";

export default function subagentManagerExtension(pi: ExtensionAPI): void {
	mountSubagentManagerIfNeeded(pi, piSubagent);
}
