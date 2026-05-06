/**
 * agent-runtime.ts — compatibility re-export shim
 *
 * The AgentRuntime has been upgraded to use @mariozechner/pi-agent-core.
 * All implementation now lives in heuris-agent.ts.
 * This file re-exports everything for backward compatibility.
 */
export { agentRuntime, agentEvents, AgentRuntime } from "./heuris-agent";
export type { AgentEvent } from "./heuris-agent";
