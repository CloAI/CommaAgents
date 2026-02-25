/**
 * App — top-level component that orchestrates the TUI flow.
 *
 * Interactive mode:
 *   Flow: ProviderSelect -> ExampleSelect -> ExampleRunner -> (back to ExampleSelect)
 *
 * Batch mode (--all):
 *   Resolves credentials automatically, runs all examples sequentially via BatchRunner.
 */

import { Box, Text, useApp } from "ink";
import Spinner from "ink-spinner";
import { useEffect, useState } from "react";
import { resolveCredential } from "../auth";
import { BatchRunner } from "./components/BatchRunner";
import { ExampleRunner } from "./components/ExampleRunner";
import { type ExampleEntry, ExampleSelect } from "./components/ExampleSelect";
import { ProviderSelect, type ProviderSelection } from "./components/ProviderSelect";
import { ALL_EXAMPLES, CORE_EXAMPLES, DAEMON_EXAMPLES, findProvider } from "./examples";

// ---------------------------------------------------------------------------
// CLI args (passed from main.tsx when --all is used)
// ---------------------------------------------------------------------------

export interface CLIArgs {
  provider: string;
  model?: string;
  coreOnly: boolean;
  daemonOnly: boolean;
}

interface AppProps {
  cliArgs?: CLIArgs;
}

// ---------------------------------------------------------------------------
// Interactive mode screens
// ---------------------------------------------------------------------------

type Screen = "provider" | "example" | "running";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function App({ cliArgs }: AppProps) {
  // If CLI args are provided, enter batch mode
  if (cliArgs) {
    return <BatchMode args={cliArgs} />;
  }

  return <InteractiveMode />;
}

// ---------------------------------------------------------------------------
// Interactive mode (original TUI flow)
// ---------------------------------------------------------------------------

function InteractiveMode() {
  const [screen, setScreen] = useState<Screen>("provider");
  const [provider, setProvider] = useState<ProviderSelection | null>(null);
  const [example, setExample] = useState<ExampleEntry | null>(null);

  const handleProviderSelect = (selection: ProviderSelection) => {
    setProvider(selection);
    setScreen("example");
  };

  const handleExampleSelect = (entry: ExampleEntry) => {
    setExample(entry);
    setScreen("running");
  };

  const handleBack = () => {
    setProvider(null);
    setScreen("provider");
  };

  const handleRunDone = () => {
    setExample(null);
    setScreen("example");
  };

  if (screen === "provider") {
    return <ProviderSelect onSelect={handleProviderSelect} />;
  }

  if (screen === "example" && provider) {
    return <ExampleSelect provider={provider} onSelect={handleExampleSelect} onBack={handleBack} />;
  }

  if (screen === "running" && provider && example) {
    return <ExampleRunner provider={provider} example={example} onDone={handleRunDone} />;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Batch mode (--all)
// ---------------------------------------------------------------------------

function BatchMode({ args }: { args: CLIArgs }) {
  const { exit } = useApp();
  const [provider, setProvider] = useState<ProviderSelection | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Resolve provider config and credentials on mount
  useEffect(() => {
    (async () => {
      const config = findProvider(args.provider);
      if (!config) {
        setError(
          `Unknown provider "${args.provider}". Available: openai, anthropic, github-copilot`,
        );
        return;
      }

      const model = args.model ?? config.defaultModel;
      const apiKey = await resolveCredential(config.providerID);
      if (!apiKey) {
        setError(
          `No credential found for "${config.providerID}". ` +
            `Set ${config.envVar} or run the TUI interactively first to save a key.`,
        );
        return;
      }

      setProvider({
        providerID: config.providerID,
        model,
        envVar: config.envVar,
        apiKey,
      });
    })();
  }, [args.provider, args.model]);

  // Error state — exit after showing the message
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        exit();
        process.exitCode = 1;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [error, exit]);

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  if (!provider) {
    return (
      <Box>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text> Resolving credentials for {args.provider}...</Text>
      </Box>
    );
  }

  // Select which examples to run
  let examples: ExampleEntry[];
  if (args.coreOnly) {
    examples = CORE_EXAMPLES;
  } else if (args.daemonOnly) {
    examples = DAEMON_EXAMPLES;
  } else {
    examples = ALL_EXAMPLES;
  }

  return <BatchRunner provider={provider} examples={examples} />;
}
