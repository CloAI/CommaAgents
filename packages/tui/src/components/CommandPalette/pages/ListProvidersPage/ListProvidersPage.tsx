import { Box, Text, useFocus, useInput } from "ink";
import type React from "react";
import { useEffect, useState } from "react";

import { useDaemon } from "../../../../hooks/useDaemon";
import type { DaemonMessageOf } from "../../../../hooks/useDaemon/useDaemon.types";
import { useDebugRender } from "../../../../hooks/useDebugRender";
import { useTheme } from "../../../../Theme";
import { isMouseEscape } from "../../../../utils/mouseEscape";
import { ScrollableList } from "../../../ScrollableList";
import { SearchInputRender, useSearchInputTheme } from "../../../SearchInput";
import { filterByQuery } from "../../../SearchInput/SearchInput.utils";

/** Provider shape as returned by the daemon's `provider_list` message. */
type ProviderInfo = DaemonMessageOf<"provider_list">["providers"][number];

function providerHaystack(provider: ProviderInfo): string {
  return [
    provider.id,
    provider.name,
    ...provider.models.map((model) => model.id),
  ].join(" ");
}

export interface ListProvidersPageProps {
  /** The unique focus identifier for this page. */
  readonly focusId: string;
  /** Return to the command list. */
  readonly onBack: () => void;
}

/**
 * Command palette sub-page that lists all configured AI providers.
 *
 * Owns a single focus zone (`focusId`). All keyboard input — typing into the
 * search bar, arrow-key navigation, and Esc — is handled in one `useInput`
 * block. `SearchInputRender` is used (no hooks) so no competing focus zone
 * is registered.
 */
export function ListProvidersPage({
  focusId,
  onBack,
}: ListProvidersPageProps): React.ReactElement {
  const debug = useDebugRender("ListProvidersPage", {});
  const { send, on } = useDaemon();
  const tokens = useTheme();
  const searchTheme = useSearchInputTheme();

  const [providers, setProviders] = useState<readonly ProviderInfo[]>([]);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { isFocused } = useFocus({ id: focusId });
  const filtered = filterByQuery(providers, query, providerHaystack);

  useInput(
    (input, key) => {
      if (input && isMouseEscape(input)) return;
      if (key.escape) {
        onBack();
        return;
      }
      if (key.upArrow) {
        setSelectedIndex((currentIndex) => Math.max(0, currentIndex - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedIndex((currentIndex) =>
          Math.min(filtered.length - 1, currentIndex + 1),
        );
        return;
      }
      if (key.backspace || key.delete) {
        setQuery((currentQuery) => currentQuery.slice(0, -1));
        setSelectedIndex(0);
        return;
      }
      if (
        input &&
        !key.ctrl &&
        !key.meta &&
        !key.tab &&
        !key.return &&
        !key.escape
      ) {
        setQuery((currentQuery) => currentQuery + input);
        setSelectedIndex(0);
      }
    },
    { isActive: isFocused },
  );

  useEffect(() => {
    const unsubscribe = on("provider_list", (message) => {
      setProviders(message.providers);
    });
    send({ type: "list_providers" });
    return unsubscribe;
  }, [send, on]);

  return (
    <ListProvidersPageRender
      debug={debug}
      tokens={tokens}
      searchTheme={searchTheme}
      providers={providers}
      query={query}
      selectedIndex={selectedIndex}
      filtered={filtered}
      onSelectedIndexChange={setSelectedIndex}
    />
  );
}

export interface ListProvidersPageRenderProps {
  /** Debug render context. */
  readonly debug: ReturnType<typeof useDebugRender>;
  /** Theme tokens. */
  readonly tokens: ReturnType<typeof useTheme>;
  /** Search input theme. */
  readonly searchTheme: ReturnType<typeof useSearchInputTheme>;
  /** List of all available providers. */
  readonly providers: readonly ProviderInfo[];
  /** Current search query. */
  readonly query: string;
  /** Currently selected index in the filtered list. */
  readonly selectedIndex: number;
  /** Providers filtered by the current query. */
  readonly filtered: readonly ProviderInfo[];
  /** Callback to update the selected index. */
  readonly onSelectedIndexChange: (index: number) => void;
}

export function ListProvidersPageRender({
  debug,
  tokens,
  searchTheme,
  providers,
  query,
  selectedIndex,
  filtered,
  onSelectedIndexChange,
}: ListProvidersPageRenderProps): React.ReactElement {
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
      <ScrollableList
        items={filtered}
        getKey={(provider) => provider.id}
        selectedIndex={selectedIndex}
        onSelectedIndexChange={onSelectedIndexChange}
        isFocused={false}
        emptyText={
          providers.length === 0 ? "Loading providers..." : "No providers match"
        }
        renderItem={(provider, isSelected) => (
          <Box
            flexDirection="row"
            paddingX={1}
            backgroundColor={isSelected ? tokens.colors.surface : undefined}
          >
            {/* overflow="hidden" prevents long names from wrapping to a second line */}
            <Box width={20} flexShrink={0} overflow="hidden">
              <Text
                bold={isSelected}
                color={tokens.colors.primary}
                wrap="truncate"
              >
                {provider.name}
              </Text>
            </Box>
            <Box width={14} flexShrink={0}>
              <Text
                color={
                  provider.authStatus === "configured"
                    ? tokens.colors.success
                    : tokens.colors.muted
                }
              >
                {provider.authStatus === "configured"
                  ? "configured"
                  : "no auth"}
              </Text>
            </Box>
            <Text color={tokens.colors.muted}>
              {provider.models.length} models
            </Text>
          </Box>
        )}
      />
    </Box>
  );
}
