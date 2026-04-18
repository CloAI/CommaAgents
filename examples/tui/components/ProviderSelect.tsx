/**
 * ProviderSelect — choose an AI provider and configure credentials.
 *
 * Displays a list of supported providers (OpenAI, Anthropic, GitHub Copilot).
 * For each provider, checks the environment variable first, then the
 * credential store (platform-aware path via resolveCredentialsPath()).
 *
 * Standard providers: prompts for an API key if none found, then offers
 * to save it for future sessions.
 *
 * GitHub Copilot: initiates the OAuth device flow — shows a verification
 * URL and user code, polls until the user authorizes, then saves the token.
 */

import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import { useEffect, useState } from "react";
import type { DeviceCodeResponse, PollResult } from "../../auth";
import { resolveCredential, startDeviceFlow, store } from "../../auth";
import type { ProviderConfig } from "../examples";
import { PROVIDERS } from "../examples";
import { useTerminalSize } from "../hooks/useTerminalSize";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ProviderSelection {
  providerID: string;
  model: string;
  envVar: string;
  apiKey: string;
}

interface ProviderSelectProps {
  onSelect: (selection: ProviderSelection) => void;
}

// ---------------------------------------------------------------------------
// Step state machine
// ---------------------------------------------------------------------------

type Step =
  | "loading" // checking credential store
  | "provider" // pick a provider
  | "model" // enter model ID
  | "apiKey" // enter API key (standard providers)
  | "saveKey" // ask to save the key
  | "deviceFlow" // Copilot OAuth device flow
  | "deviceError"; // device flow failed

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProviderSelect({ onSelect }: ProviderSelectProps) {
  const { rows } = useTerminalSize();
  const [step, setStep] = useState<Step>("loading");
  const [selectedProvider, setSelectedProvider] = useState<ProviderConfig | null>(null);
  const [modelInput, setModelInput] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");

  // Credential store state (loaded async on mount)
  const [savedProviders, setSavedProviders] = useState<Set<string>>(new Set());

  // Copilot device flow state
  const [deviceInfo, setDeviceInfo] = useState<DeviceCodeResponse | null>(null);
  const [deviceError, setDeviceError] = useState<string>("");
  const [pendingApiKey, setPendingApiKey] = useState<string>("");

  // --- Load saved credentials on mount ---
  useEffect(() => {
    (async () => {
      try {
        const all = await store.all();
        setSavedProviders(new Set(Object.keys(all)));
      } catch {
        // Ignore store read errors — just proceed without saved indicators
      }
      setStep("provider");
    })();
  }, []);

  // ---------------------------------------------------------------------------
  // Provider list items
  // ---------------------------------------------------------------------------

  const items = PROVIDERS.map((p) => {
    const hasEnvKey = Boolean(process.env[p.envVar]);
    const hasSaved = savedProviders.has(p.providerID);
    const suffix = hasEnvKey ? " (env)" : hasSaved ? " (saved)" : "";
    return { label: `${p.label}${suffix}`, value: p.providerID };
  });

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleProviderSelect = (item: { label: string; value: string }) => {
    const provider = PROVIDERS.find((p) => p.providerID === item.value);
    if (!provider) return;
    setSelectedProvider(provider);
    setModelInput(provider.defaultModel);
    setStep("model");
  };

  const handleModelSubmit = async () => {
    if (!selectedProvider) return;
    const model = modelInput.trim() || selectedProvider.defaultModel;

    // Try to resolve an existing credential (env → store, with refresh)
    const existing = await resolveCredential(selectedProvider.providerID);
    if (existing) {
      onSelect({
        providerID: selectedProvider.providerID,
        model,
        envVar: selectedProvider.envVar,
        apiKey: existing,
      });
      return;
    }

    // No credential found — branch by provider type
    if (selectedProvider.providerID === "github-copilot") {
      startCopilotFlow(model);
    } else {
      setStep("apiKey");
    }
  };

  const handleApiKeySubmit = () => {
    if (!selectedProvider) return;
    const key = apiKeyInput.trim();
    if (!key) return;
    setPendingApiKey(key);
    setStep("saveKey");
  };

  const handleSaveResponse = async (item: { label: string; value: string }) => {
    if (!selectedProvider) return;
    const model = modelInput.trim() || selectedProvider.defaultModel;

    if (item.value === "yes") {
      await store.set(selectedProvider.providerID, { type: "api", key: pendingApiKey });
    }

    onSelect({
      providerID: selectedProvider.providerID,
      model,
      envVar: selectedProvider.envVar,
      apiKey: pendingApiKey,
    });
  };

  // ---------------------------------------------------------------------------
  // Copilot device flow
  // ---------------------------------------------------------------------------

  const startCopilotFlow = async (_model: string) => {
    setStep("deviceFlow");
    setDeviceError("");
    setDeviceInfo(null);

    try {
      const { device, poll } = await startDeviceFlow();
      setDeviceInfo(device);

      // Poll in background
      const result: PollResult = await poll();

      if (result.type === "success") {
        // Save the OAuth tokens
        await store.set("github-copilot", result.auth);

        const model = modelInput.trim() || selectedProvider?.defaultModel || "gpt-4o";
        onSelect({
          providerID: "github-copilot",
          model,
          envVar: "GITHUB_TOKEN",
          apiKey: result.auth.accessToken,
        });
      } else if (result.type === "expired") {
        setDeviceError("Device code expired. Please try again.");
        setStep("deviceError");
      } else if (result.type === "denied") {
        setDeviceError("Authorization was denied.");
        setStep("deviceError");
      } else {
        setDeviceError(result.message);
        setStep("deviceError");
      }
    } catch (err) {
      setDeviceError(err instanceof Error ? err.message : String(err));
      setStep("deviceError");
    }
  };

  const handleRetry = (item: { label: string; value: string }) => {
    if (item.value === "retry") {
      const model = modelInput.trim() || selectedProvider?.defaultModel || "gpt-4o";
      startCopilotFlow(model);
    } else {
      setStep("provider");
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Box flexDirection="column" height={rows}>
      <Text bold color="cyan">
        comma-agents Example Runner
      </Text>
      <Text dimColor>─────────────────────────────</Text>

      {/* Loading credential store */}
      {step === "loading" && (
        <Box marginTop={1}>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> Checking saved credentials...</Text>
        </Box>
      )}

      {/* Step 1: Pick a provider */}
      {step === "provider" && (
        <Box flexDirection="column" marginTop={1}>
          <Text>Select an AI provider:</Text>
          <Box marginTop={1}>
            <SelectInput items={items} onSelect={handleProviderSelect} />
          </Box>
        </Box>
      )}

      {/* Step 2: Enter model ID */}
      {step === "model" && selectedProvider && (
        <Box flexDirection="column" marginTop={1}>
          <Text>
            Provider: <Text color="green">{selectedProvider.label}</Text>
          </Text>
          <Text>Enter model ID (press Enter for default):</Text>
          <Box marginTop={1}>
            <Text color="gray">{">"} </Text>
            <TextInput value={modelInput} onChange={setModelInput} onSubmit={handleModelSubmit} />
          </Box>
        </Box>
      )}

      {/* Step 3a: Enter API key (standard providers) */}
      {step === "apiKey" && selectedProvider && (
        <Box flexDirection="column" marginTop={1}>
          <Text>
            Provider: <Text color="green">{selectedProvider.label}</Text>
          </Text>
          <Text>
            Model: <Text color="green">{modelInput || selectedProvider.defaultModel}</Text>
          </Text>
          <Text color="yellow">
            No {selectedProvider.envVar} found in environment or saved credentials.
          </Text>
          <Text>Enter your API key:</Text>
          <Box marginTop={1}>
            <Text color="gray">{">"} </Text>
            <TextInput
              value={apiKeyInput}
              onChange={setApiKeyInput}
              onSubmit={handleApiKeySubmit}
              mask="*"
            />
          </Box>
        </Box>
      )}

      {/* Step 3b: Save key? */}
      {step === "saveKey" && selectedProvider && (
        <Box flexDirection="column" marginTop={1}>
          <Text>Save this key for future sessions?</Text>
          <Text dimColor>(Stored in platform credentials file with 0600 perms)</Text>
          <Box marginTop={1}>
            <SelectInput
              items={[
                { label: "Yes", value: "yes" },
                { label: "No, just use it this session", value: "no" },
              ]}
              onSelect={handleSaveResponse}
            />
          </Box>
        </Box>
      )}

      {/* Step 3c: Copilot device flow */}
      {step === "deviceFlow" && (
        <Box flexDirection="column" marginTop={1}>
          <Text>
            Provider: <Text color="green">GitHub Copilot</Text>
          </Text>
          <Text>
            Model:{" "}
            <Text color="green">{modelInput || selectedProvider?.defaultModel || "gpt-4o"}</Text>
          </Text>

          {!deviceInfo && (
            <Box marginTop={1}>
              <Text color="cyan">
                <Spinner type="dots" />
              </Text>
              <Text> Requesting device code from GitHub...</Text>
            </Box>
          )}

          {deviceInfo && (
            <Box flexDirection="column" marginTop={1}>
              <Text>
                Open this URL:{" "}
                <Text bold color="cyan">
                  {deviceInfo.verificationUri}
                </Text>
              </Text>
              <Text>
                Enter this code:{" "}
                <Text bold color="yellow">
                  {deviceInfo.userCode}
                </Text>
              </Text>
              <Box marginTop={1}>
                <Text color="cyan">
                  <Spinner type="dots" />
                </Text>
                <Text> Waiting for authorization...</Text>
              </Box>
            </Box>
          )}
        </Box>
      )}

      {/* Step 3d: Device flow error */}
      {step === "deviceError" && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="red">Device flow failed: {deviceError}</Text>
          <Box marginTop={1}>
            <SelectInput
              items={[
                { label: "Retry", value: "retry" },
                { label: "Back to provider list", value: "back" },
              ]}
              onSelect={handleRetry}
            />
          </Box>
        </Box>
      )}
    </Box>
  );
}
