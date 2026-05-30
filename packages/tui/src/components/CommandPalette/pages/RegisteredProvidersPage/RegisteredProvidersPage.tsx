import { Box, Text, useFocus, useInput } from "ink";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useDaemon } from "../../../../hooks/useDaemon";
import type { DaemonMessageOf } from "../../../../hooks/useDaemon/useDaemon.types";
import { useDebugRender } from "../../../../hooks/useDebugRender";
import { useTheme } from "../../../../Theme";
import { isMouseEscape } from "../../../../utils/mouseEscape";
import { ScrollableList } from "../../../ScrollableList";
import { SearchInputRender, useSearchInputTheme } from "../../../SearchInput";
import { filterByQuery } from "../../../SearchInput/SearchInput.utils";

type ProviderInfo = DaemonMessageOf<"provider_list">["providers"][number];

type ViewState =
  | { readonly kind: "list" }
  | {
      readonly kind: "api-input";
      readonly provider: ProviderInfo;
    }
  | {
      readonly kind: "oauth-confirm";
      readonly provider: ProviderInfo;
    };

const RAW_MODE_SUPPORTED = typeof process.stdin.setRawMode === "function";

const CREDENTIAL_TYPE_LABELS: Readonly<Record<string, string>> = {
  api: "API Key",
  oauth: "OAuth",
  custom: "Custom",
  none: "local",
};

function providerHaystack(p: ProviderInfo): string {
  return [
    p.id,
    p.name,
    CREDENTIAL_TYPE_LABELS[p.credentialType] ?? "",
    ...p.models.map((m: { id: string }) => m.id),
  ].join(" ");
}

const UNPRINTABLE_KEYS = new Set([
  "upArrow",
  "downArrow",
  "leftArrow",
  "rightArrow",
  "escape",
  "return",
  "tab",
  "delete",
  "backspace",
  "pageUp",
  "pageDown",
  "home",
  "end",
]);

function isPrintable(input: string, key: Record<string, unknown>): boolean {
  if (!input) return false;
  if (key.meta) return false;
  if (key.ctrl) return false;
  if (key.tab) return false;
  for (const k of UNPRINTABLE_KEYS) {
    if (key[k] === true) return false;
  }
  return true;
}

export function RegisteredProvidersPage({
  focusId,
}: {
  readonly focusId: string;
}): React.ReactElement {
  const debug = useDebugRender("RegisteredProvidersPage", {});
  const { send, on } = useDaemon();
  const tokens = useTheme();
  const searchTheme = useSearchInputTheme();

  const [providers, setProviders] = useState<readonly ProviderInfo[]>([]);
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [pending, setPending] = useState(false);
  const [viewState, setViewState] = useState<ViewState>({ kind: "list" });
  const [apiKeyInput, setApiKeyInput] = useState("");

  const { isFocused } = useFocus({ id: focusId, isActive: RAW_MODE_SUPPORTED });

  const registered = useMemo(
    () => providers.filter((p) => p.isCustom),
    [providers],
  );

  const available = useMemo(
    () => providers.filter((p) => !p.isCustom),
    [providers],
  );

  const filteredRegistered = useMemo(
    () => filterByQuery(registered, query, providerHaystack),
    [registered, query],
  );

  const filteredAvailable = useMemo(
    () => filterByQuery(available, query, providerHaystack),
    [available, query],
  );

  const unified = useMemo(
    () => [...filteredRegistered, ...filteredAvailable],
    [filteredRegistered, filteredAvailable],
  );

  const fetchProviders = useCallback(() => {
    send({ type: "list_providers" });
  }, [send]);

  const registerProvider = useCallback(
    (p: ProviderInfo) => {
      if (p.isCustom || pending) return;
      setPending(true);
      send({ type: "register_provider", providerId: p.id });
      setTimeout(() => {
        fetchProviders();
        setPending(false);
      }, 300);
    },
    [pending, send, fetchProviders],
  );

  const saveCredentialAndRegister = useCallback(
    (p: ProviderInfo, key: string) => {
      if (pending) return;
      setPending(true);
      send({
        type: "set_credential",
        providerId: p.id,
        credentialType: "api",
        apiKey: key,
      });
      send({ type: "register_provider", providerId: p.id });
      setTimeout(() => {
        fetchProviders();
        setPending(false);
      }, 300);
    },
    [pending, send, fetchProviders],
  );

  const activateRegistration = useCallback(
    (p: ProviderInfo) => {
      if (pending) return;
      if (p.isCustom) {
        setPending(true);
        send({ type: "unregister_provider", providerId: p.id });
        setTimeout(() => {
          fetchProviders();
          setPending(false);
        }, 300);
        return;
      }
      if (p.credentialType === "api" && p.authStatus === "none") {
        setViewState({ kind: "api-input", provider: p });
        setApiKeyInput("");
        return;
      }
      if (p.credentialType === "oauth" && p.authStatus === "none") {
        setViewState({ kind: "oauth-confirm", provider: p });
        return;
      }
      registerProvider(p);
    },
    [pending, send, fetchProviders, registerProvider],
  );

  useInput(
    (input, key) => {
      if (input && isMouseEscape(input)) return;

      if (viewState.kind === "api-input") {
        if (key.escape) {
          setViewState({ kind: "list" });
          setApiKeyInput("");
          return;
        }
        if (key.return) {
          saveCredentialAndRegister(viewState.provider, apiKeyInput);
          setViewState({ kind: "list" });
          setApiKeyInput("");
          return;
        }
        if (key.backspace || key.delete) {
          setApiKeyInput((v) => v.slice(0, -1));
          return;
        }
        if (isPrintable(input, key)) {
          setApiKeyInput((v) => v + input);
        }
        return;
      }

      if (viewState.kind === "oauth-confirm") {
        if (key.escape) {
          setViewState({ kind: "list" });
          return;
        }
        if (key.return) {
          registerProvider(viewState.provider);
          setViewState({ kind: "list" });
        }
        return;
      }

      if (key.upArrow) {
        setSelectedIdx((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedIdx((i) => Math.min(unified.length - 1, i + 1));
        return;
      }
      if (key.return) {
        const selected = unified[selectedIdx];
        if (selected) activateRegistration(selected);
        return;
      }
      if (key.backspace || key.delete) {
        setQuery((q) => q.slice(0, -1));
        setSelectedIdx(0);
        return;
      }
      if (isPrintable(input, key)) {
        setQuery((q) => q + input);
        setSelectedIdx(0);
      }
    },
    { isActive: isFocused },
  );

  useEffect(() => {
    const unsub = on("provider_list", (msg) => {
      setProviders(msg.providers);
    });
    fetchProviders();
    return unsub;
  }, [fetchProviders, on]);

  useEffect(() => {
    const unsub = on("credential_set", () => {
      fetchProviders();
    });
    return unsub;
  }, [fetchProviders, on]);

  const statusColor = useCallback(
    (status: string) =>
      status === "configured" ? tokens.colors.success : tokens.colors.muted,
    [tokens.colors.success, tokens.colors.muted],
  );

  const credentialTypeColor = useCallback(
    (type: string) => {
      if (type === "oauth") return tokens.colors.info ?? tokens.colors.primary;
      if (type === "none") return tokens.colors.muted;
      return tokens.colors.muted;
    },
    [tokens.colors],
  );

  if (viewState.kind === "api-input") {
    const p = viewState.provider;
    return (
      <Box
        ref={debug.ref}
        flexDirection="column"
        width="100%"
        flexGrow={1}
        paddingLeft={1}
      >
        <Box marginBottom={1}>
          <Text bold color={tokens.colors.primary}>
            Register {p.name}
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text color={tokens.colors.muted}>
            Provider requires an API key. It will be stored in{" "}
            <Text color={tokens.colors.primary}>credentials.json</Text>.
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text color={tokens.colors.primary} bold>
            API key:{" "}
          </Text>
          <Text color={tokens.colors.muted}>
            {apiKeyInput.length > 0
              ? "•".repeat(apiKeyInput.length)
              : "(type to enter)"}
          </Text>
          {apiKeyInput.length > 0 && (
            <Text dimColor> ({apiKeyInput.length} chars)</Text>
          )}
        </Box>
        <Box marginTop={1}>
          <Text color={tokens.colors.muted}>
            Enter to confirm · Esc to cancel
            {pending ? " · Processing..." : ""}
          </Text>
        </Box>
      </Box>
    );
  }

  if (viewState.kind === "oauth-confirm") {
    const p = viewState.provider;
    return (
      <Box
        ref={debug.ref}
        flexDirection="column"
        width="100%"
        flexGrow={1}
        paddingLeft={1}
      >
        <Box marginBottom={1}>
          <Text bold color={tokens.colors.warning ?? tokens.colors.primary}>
            OAuth Required
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text color={tokens.colors.muted}>
            {p.name} requires OAuth authentication. This must be configured
            externally (e.g., device flow or web-based OAuth).
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text color={tokens.colors.muted}>
            You can register the provider now and configure OAuth credentials
            later by adding them directly to credentials.json.
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text color={tokens.colors.primary}>
            Register{" "}
            <Text bold color={tokens.colors.warning ?? tokens.colors.primary}>
              {p.name}
            </Text>{" "}
            without credentials?
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color={tokens.colors.muted}>
            Enter to confirm · Esc to cancel
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box ref={debug.ref} flexDirection="column" width="100%" flexGrow={1}>
      <Box flexShrink={0} marginBottom={1}>
        <SearchInputRender
          theme={searchTheme}
          value={query}
          placeholder="Search providers..."
          prompt="› "
        />
      </Box>

      {providers.length === 0 ? (
        <Text color={tokens.colors.muted}>Loading providers...</Text>
      ) : unified.length === 0 ? (
        <Text color={tokens.colors.muted}>No providers match</Text>
      ) : (
        <Box flexDirection="column" flexGrow={1} overflow="hidden">
          {filteredRegistered.length > 0 && (
            <Box flexShrink={0} marginTop={0} marginBottom={1}>
              <Text bold color={tokens.colors.primary}>
                Registered
              </Text>
            </Box>
          )}

          <ScrollableList
            items={unified}
            getKey={(p) => p.id}
            selectedIndex={selectedIdx}
            onSelectedIndexChange={setSelectedIdx}
            isFocused={false}
            emptyText=""
            renderItem={(p, isSelected) => {
              const ctLabel = CREDENTIAL_TYPE_LABELS[p.credentialType] ?? "api";
              const isAvailableSection =
                filteredRegistered.length > 0 &&
                unified.indexOf(p) === filteredRegistered.length;

              return (
                <Box flexDirection="column">
                  {isAvailableSection && (
                    <Box flexShrink={0} marginTop={1} marginBottom={1}>
                      <Text bold color={tokens.colors.primary}>
                        Available
                      </Text>
                    </Box>
                  )}
                  <Box
                    flexDirection="row"
                    paddingX={1}
                    backgroundColor={
                      isSelected ? tokens.colors.surface : undefined
                    }
                  >
                    <Box width={2} flexShrink={0}>
                      <Text
                        color={
                          p.isCustom
                            ? tokens.colors.success
                            : tokens.colors.muted
                        }
                      >
                        {p.isCustom ? "●" : "○"}
                      </Text>
                    </Box>
                    <Box width={22} flexShrink={0} overflow="hidden">
                      <Text
                        bold={isSelected}
                        color={tokens.colors.primary}
                        wrap="truncate"
                      >
                        {p.name}
                      </Text>
                    </Box>
                    <Box width={10} flexShrink={0}>
                      <Text color={credentialTypeColor(p.credentialType)}>
                        [{ctLabel}]
                      </Text>
                    </Box>
                    <Box width={14} flexShrink={0}>
                      <Text color={statusColor(p.authStatus)}>
                        {p.authStatus === "configured"
                          ? "configured"
                          : "no auth"}
                      </Text>
                    </Box>
                    <Text color={tokens.colors.muted}>
                      {p.models.length} models
                    </Text>
                  </Box>
                </Box>
              );
            }}
          />
        </Box>
      )}

      <Box flexShrink={0} marginTop={1}>
        <Text color={tokens.colors.muted}>
          {providers.some((p) => !p.isCustom)
            ? "Enter to register & set credentials · Esc to go back"
            : "Enter to toggle · Esc to go back"}
          {pending ? " · Processing..." : ""}
        </Text>
      </Box>
    </Box>
  );
}
