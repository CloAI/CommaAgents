import type { StrategyLoaderInputs } from "../../runs.types";
/**
 * Merge provider inputs while rejecting conflicting owners and MCP tools.
 * @param {Partial<StrategyLoaderInputs>} target - Accumulated loader inputs.
 * @param {Partial<StrategyLoaderInputs>} incoming - Inputs supplied by this provider.
 * @param {Map<keyof StrategyLoaderInputs, string>} ownerByField - Provider ownership by loader field.
 * @param {string} providerName - Provider name used in conflict errors.
 * @returns {void} Nothing; updates accumulated inputs and ownership.
 * @internal
 */
export function mergeStrategyInputs(
  target: Partial<StrategyLoaderInputs>,
  incoming: Partial<StrategyLoaderInputs>,
  ownerByField: Map<keyof StrategyLoaderInputs, string>,
  providerName: string,
): void {
  for (const key of Object.keys(incoming) as (keyof StrategyLoaderInputs)[]) {
    const value = incoming[key];
    if (value === undefined) {
      continue;
    }

    if (key === "mcpToolsByAgent") {
      const existing = target.mcpToolsByAgent ?? {};
      const addition = incoming.mcpToolsByAgent ?? {};
      const merged = { ...existing };
      for (const [agentName, toolSet] of Object.entries(addition)) {
        const prior = merged[agentName];
        if (prior === undefined) {
          merged[agentName] = toolSet;
          continue;
        }
        const overlappingTool = [
          ...Object.keys(toolSet.tools),
          ...Object.keys(toolSet.origins),
        ].find(
          (toolName) => toolName in prior.tools || toolName in prior.origins,
        );
        if (overlappingTool !== undefined) {
          throw new Error(
            `Preparation ${providerName} provides duplicate MCP tool ${agentName}/${overlappingTool}`,
          );
        }
        merged[agentName] = {
          tools: { ...prior.tools, ...toolSet.tools },
          origins: { ...prior.origins, ...toolSet.origins },
        };
      }
      Object.assign(target, { mcpToolsByAgent: merged });
      ownerByField.set(key, providerName);
      continue;
    }

    if (target[key] !== undefined) {
      throw new Error(
        `Preparation ${providerName} and ${ownerByField.get(key)} both provide ${key}`,
      );
    }
    // Each field has one owner; the MCP agent map is combined above.
    Object.assign(target, { [key]: value });
    ownerByField.set(key, providerName);
  }
}
