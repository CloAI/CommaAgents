import type { DiscoveredProvider } from "./ProvidersSettings.types";
/** Representative catalog including explicit false and unknown capabilities. */
export const exampleProviders: readonly DiscoveredProvider[] = [
  {
    id: "alpha",
    name: "Alpha",
    credentialType: "api",
    authStatus: "configured",
    models: [
      {
        id: "vision-tools",
        sources: ["models.dev"],
        metadata: {
          name: "Vision tools",
          capabilities: { vision: true, tools: true },
        },
      },
      {
        id: "reasoner",
        sources: ["models.dev"],
        metadata: {
          name: "Reasoner",
          family: "logic",
          capabilities: { reasoning: true, tools: false },
        },
      },
      {
        id: "unknown",
        sources: ["models.dev"],
        metadata: {
          name: "Unknown capabilities",
        },
      },
    ],
    origin: "catalog",
    discovery: {
      status: "catalog_only",
    },
  },
  {
    id: "beta",
    name: "Beta",
    credentialType: "none",
    authStatus: "none",
    models: [
      {
        id: "all-rounder",
        sources: ["models.dev"],
        metadata: {
          name: "All rounder",
          capabilities: {
            vision: true,
            tools: true,
            reasoning: true,
            attachment: true,
            structuredOutput: true,
          },
        },
      },
    ],
    origin: "catalog",
    discovery: {
      status: "catalog_only",
    },
  },
  {
    id: "empty",
    name: "Empty",
    credentialType: "api",
    authStatus: "none",
    models: [],
    origin: "registered",
    discovery: {
      status: "catalog_only",
    },
  },
];
