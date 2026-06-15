import { Box, Text, useFocus, useInput } from "ink";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useDaemon } from "../../../../hooks/useDaemon";
import { useDebugRender } from "../../../../hooks/useDebugRender";
import { useTheme } from "../../../../Theme";
import type { Theme } from "../../../../Theme/Theme.types";
import { isMouseEscape } from "../../../../utils/mouseEscape";
import { ScrollableList } from "../../../ScrollableList";
import { SearchInputRender, useSearchInputTheme } from "../../../SearchInput";
import type { SearchInputTheme } from "../../../SearchInput/SearchInput.theme";
import { filterByQuery } from "../../../SearchInput/SearchInput.utils";
import {
  CREDENTIAL_TYPE_LABELS,
  RAW_MODE_SUPPORTED,
} from "./RegisteredProvidersPage.constants";
import type {
  ProviderInfo,
  RegisteredProvidersViewState,
} from "./RegisteredProvidersPage.types";
import {
  createProviderSearchString,
  isPrintableCharacter,
} from "./RegisteredProvidersPage.utils";

export interface RegisteredProvidersPageProps {
  /** Unique identifier for the page to manage focus. */
  readonly focusId: string;
}

export function RegisteredProvidersPage({
  focusId,
}: RegisteredProvidersPageProps): React.ReactElement {
  const debug = useDebugRender("RegisteredProvidersPage", {});
  const { send, on } = useDaemon();
  const tokens = useTheme();
  const searchTheme = useSearchInputTheme();

  const [providers, setProviders] = useState<readonly ProviderInfo[]>([]);
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [isPending, setIsPending] = useState(false);
  const [viewState, setViewState] = useState<RegisteredProvidersViewState>({
    kind: "list",
  });
  const [apiKeyInput, setApiKeyInput] = useState("");

  const { isFocused } = useFocus({
    id: focusId,
    isActive: RAW_MODE_SUPPORTED,
  });

  const registeredProviders = useMemo(
    () => providers.filter((provider) => provider.isCustom),
    [providers],
  );

  const availableProviders = useMemo(
    () => providers.filter((provider) => !provider.isCustom),
    [providers],
  );

  const filteredRegisteredProviders = useMemo(
    () => filterByQuery(registeredProviders, query, createProviderSearchString),
    [registeredProviders, query],
  );

  const filteredAvailableProviders = useMemo(
    () => filterByQuery(availableProviders, query, createProviderSearchString),
    [availableProviders, query],
  );

  const unifiedProviders = useMemo(
    () => [...filteredRegisteredProviders, ...filteredAvailableProviders],
    [filteredRegisteredProviders, filteredAvailableProviders],
  );

  const fetchProviders = useCallback(() => {
    send({ type: "list_providers" });
  }, [send]);

  const registerProvider = useCallback(
    (provider: ProviderInfo) => {
      if (provider.isCustom || isPending) return;
      setIsPending(true);
      send({ type: "register_provider", providerId: provider.id });
      setTimeout(() => {
        fetchProviders();
        setIsPending(false);
      }, 300);
    },
    [isPending, send, fetchProviders],
  );

  const saveCredentialAndRegister = useCallback(
    (provider: ProviderInfo, key: string) => {
      if (isPending) return;
      setIsPending(true);
      send({
        type: "set_credential",
        providerId: provider.id,
        credentialType: "api",
        apiKey: key,
      });
      send({ type: "register_provider", providerId: provider.id });
      setTimeout(() => {
        fetchProviders();
        setIsPending(false);
      }, 300);
    },
    [isPending, send, fetchProviders],
  );

  const activateRegistration = useCallback(
    (provider: ProviderInfo) => {
      if (isPending) return;
      if (provider.isCustom) {
        setIsPending(true);
        send({ type: "unregister_provider", providerId: provider.id });
        setTimeout(() => {
          fetchProviders();
          setIsPending(false);
        }, 300);
        return;
      }
      if (provider.credentialType === "api" && provider.authStatus === "none") {
        setViewState({ kind: "api-input", provider });
        setApiKeyInput("");
        return;
      }
      if (
        provider.credentialType === "oauth" &&
        provider.authStatus === "none"
      ) {
        setViewState({ kind: "oauth-confirm", provider });
        return;
      }
      registerProvider(provider);
    },
    [isPending, send, fetchProviders, registerProvider],
  );

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
        if (isPrintableCharacter(input, key)) {
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
        setSelectedIdx((i) => Math.min(unifiedProviders.length - 1, i + 1));
        return;
      }
      if (key.return) {
        const selected = unifiedProviders[selectedIdx];
        if (selected) activateRegistration(selected);
        return;
      }
      if (key.backspace || key.delete) {
        setQuery((q) => q.slice(0, -1));
        setSelectedIdx(0);
        return;
      }
      if (isPrintableCharacter(input, key)) {
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

  return (
    <RegisteredProvidersPageRender
      debugRef={debug.ref}
      tokens={tokens}
      searchTheme={searchTheme}
      providers={providers}
      unifiedProviders={unifiedProviders}
      filteredRegisteredProviders={filteredRegisteredProviders}
      query={query}
      selectedIdx={selectedIdx}
      onSelectedIndexChange={setSelectedIdx}
      viewState={viewState}
      apiKeyInput={apiKeyInput}
      isPending={isPending}
      statusColor={statusColor}
      credentialTypeColor={credentialTypeColor}
    />
  );
}

export interface RegisteredProvidersPageRenderProps {
  /** Reference for debug rendering. */
  readonly debugRef: React.RefObject<unknown>;
  /** Global theme tokens. */
  readonly tokens: Theme;
  /** Theme for the search input. */
  readonly searchTheme: SearchInputTheme;
  /** All fetched providers. */
  readonly providers: readonly ProviderInfo[];
  /** All filtered providers (registered first, then available). */
  readonly unifiedProviders: readonly ProviderInfo[];
  /** Filtered list of registered providers to determine section boundary. */
  readonly filteredRegisteredProviders: readonly ProviderInfo[];
  /** Current search query. */
  readonly query: string;
  /** Index of the currently selected provider. */
  readonly selectedIdx: number;
  /** Callback to update the selected index. */
  readonly onSelectedIndexChange: (index: number) => void;
  /** Current view state (list, api-input, or oauth-confirm). */
  readonly viewState: RegisteredProvidersViewState;
  /** Current text in the API key input field. */
  readonly apiKeyInput: string;
  /** Whether a registration process is currently pending. */
  readonly isPending: boolean;
  /** Function to resolve the status color for a provider. */
  readonly statusColor: (status: string) => string;
  /** Function to resolve the credential type color for a provider. */
  readonly credentialTypeColor: (type: string) => string;
}

export function RegisteredProvidersPageRender({
  debugRef,
  tokens,
  searchTheme,
  providers,
  unifiedProviders,
  filteredRegisteredProviders,
  query,
  selectedIdx,
  onSelectedIndexChange,
  viewState,
  apiKeyInput,
  isPending,
  statusColor,
  credentialTypeColor,
}: RegisteredProvidersPageRenderProps): React.ReactElement {
  if (viewState.kind === "api-input") {
    const p = viewState.provider;
    return (
      <Box
        ref={debugRef}
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
            {isPending ? " · Processing..." : ""}
          </Text>
        </Box>
      </Box>
    );
  }

  if (viewState.kind === "oauth-confirm") {
    const p = viewState.provider;
    return (
      <Box
        ref={debugRef}
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
    <Box ref={debugRef} flexDirection="column" width="100%" flexGrow={1}>
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
      ) : unifiedProviders.length === 0 ? (
        <Text color={tokens.colors.muted}>No providers match</Text>
      ) : (
        <Box flexDirection="column" flexGrow={1} overflow="hidden">
          {filteredRegisteredProviders.length > 0 && (
            <Box flexShrink={0} marginTop={0} marginBottom={1}>
              <Text bold color={tokens.colors.primary}>
                Registered
              </Text>
            </Box>
          )}

          <ScrollableList
            items={unifiedProviders}
            getKey={(p) => p.id}
            selectedIndex={selectedIdx}
            onSelectedIndexChange={onSelectedIndexChange}
            isFocused={false}
            emptyText=""
            renderItem={(p, isSelected) => {
              const ctLabel = CREDENTIAL_TYPE_LABELS[p.credentialType] ?? "api";
              const isAvailableSection =
                filteredRegisteredProviders.length > 0 &&
                unifiedProviders.indexOf(p) ===
                  filteredRegisteredProviders.length;

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
          {providers.some((provider) => !provider.isCustom)
            ? "Enter to register & set credentials · Esc to go back"
            : "Enter to toggle · Esc to go back"}
          {isPending ? " · Processing..." : ""}
        </Text>
      </Box>
    </Box>
  );
}
