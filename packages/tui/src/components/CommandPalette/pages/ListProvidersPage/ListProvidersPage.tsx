import { Box, Text, useFocus, useInput } from "ink";
import type React from "react";
import { useEffect, useState } from "react";

import { useDaemon } from "../../../../hooks/useDaemon";
import type { DaemonMessageOf } from "../../../../hooks/useDaemon/useDaemon.types";
import { useDebugRender } from "../../../../hooks/useDebugRender";
import { useTheme } from "../../../../theme";
import { isMouseEscape } from "../../../../utils/mouseEscape";
import { ScrollableList } from "../../../ScrollableList";
import { SearchInputRender, useSearchInputTheme } from "../../../SearchInput";
import { filterByQuery } from "../../../SearchInput/SearchInput.utils";

/** Provider shape as returned by the daemon's `provider_list` message. */
type ProviderInfo = DaemonMessageOf<"provider_list">["providers"][number];

const RAW_MODE_SUPPORTED = typeof process.stdin.setRawMode === "function";

function providerHaystack(p: ProviderInfo): string {
  return [p.id, p.name, ...p.models.map((m: { id: string }) => m.id)].join(" ");
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
}: {
  readonly focusId: string;
}): React.ReactElement {
  const debug = useDebugRender("ListProvidersPage", {});
  const { send, on } = useDaemon();
  const tokens = useTheme();
  const searchTheme = useSearchInputTheme();

  const [providers, setProviders] = useState<readonly ProviderInfo[]>([]);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Single focus zone — no SearchInput competing for the same id.
  const { isFocused } = useFocus({ id: focusId, isActive: RAW_MODE_SUPPORTED });

  const filtered = filterByQuery(providers, query, providerHaystack);

  useInput(
    (input, key) => {
      if (input && isMouseEscape(input)) return;
      if (key.upArrow) {
        setSelectedIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedIndex((i) => Math.min(filtered.length - 1, i + 1));
        return;
      }
      // Typing updates the search query.
      if (key.backspace || key.delete) {
        setQuery((q) => q.slice(0, -1));
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
        setQuery((q) => q + input);
        setSelectedIndex(0);
      }
    },
    { isActive: isFocused },
  );

  useEffect(() => {
    const unsub = on("provider_list", (msg) => {
      setProviders(msg.providers);
    });
    send({ type: "list_providers" });
    return unsub;
  }, [send, on]);

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
        getKey={(p) => p.id}
        selectedIndex={selectedIndex}
        onSelectedIndexChange={setSelectedIndex}
        isFocused={false}
        emptyText={
          providers.length === 0 ? "Loading providers..." : "No providers match"
        }
        renderItem={(p, isSelected) => (
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
                {p.name}
              </Text>
            </Box>
            <Box width={14} flexShrink={0}>
              <Text
                color={
                  p.authStatus === "configured"
                    ? tokens.colors.success
                    : tokens.colors.muted
                }
              >
                {p.authStatus === "configured" ? "configured" : "no auth"}
              </Text>
            </Box>
            <Text color={tokens.colors.muted}>{p.models.length} models</Text>
          </Box>
        )}
      />
    </Box>
  );
}
