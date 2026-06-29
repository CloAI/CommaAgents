import { Box, Text, useFocus, useInput } from "ink";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useDaemon } from "../../../../hooks/useDaemon";
import type { DaemonMessageOf } from "../../../../hooks/useDaemon/useDaemon.types";
import { useRefreshDiscoveredStrategies } from "../../../../hooks/useStrategies";
import { useTheme } from "../../../../Theme";
import { isMouseEscape } from "../../../../utils/mouseEscape";
import { ScrollableList } from "../../../ScrollableList";
import { SearchInputRender, useSearchInputTheme } from "../../../SearchInput";
import { filterByQuery } from "../../../SearchInput/SearchInput.utils";

type HubPackage = NonNullable<
  DaemonMessageOf<"hub_packages">["available"]
>[number];
type InstalledPackage = NonNullable<
  DaemonMessageOf<"hub_packages">["installed"]
>[number];

export interface HubPackagesPageProps {
  readonly focusId: string;
  readonly onBack: () => void;
}

/** Browse and mutate Hub packages through the daemon-owned manager. */
export function HubPackagesPage({
  focusId,
  onBack,
}: HubPackagesPageProps): React.ReactElement {
  const { send, on } = useDaemon();
  const refreshStrategies = useRefreshDiscoveredStrategies();
  const tokens = useTheme();
  const searchTheme = useSearchInputTheme();
  const { isFocused } = useFocus({ id: focusId });
  const [packages, setPackages] = useState<readonly HubPackage[]>([]);
  const [installed, setInstalled] = useState<readonly InstalledPackage[]>([]);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [status, setStatus] = useState("Loading packages...");
  const [confirmName, setConfirmName] = useState<string>();
  const requestIdRef = useRef<string | undefined>(undefined);

  const requestList = useCallback((): void => {
    const requestId = crypto.randomUUID();
    requestIdRef.current = requestId;
    setStatus("Loading packages...");
    send({ type: "hub_list", requestId });
  }, [send]);

  useEffect(() => {
    const unsubscribePackages = on("hub_packages", (message) => {
      if (message.requestId !== requestIdRef.current) return;
      if (message.operation === "list") {
        setPackages(message.available ?? []);
        setInstalled(message.installed ?? []);
        setStatus("");
        return;
      }
      setStatus(
        message.operation === "remove"
          ? message.removed
            ? "Package removed."
            : "Package was not installed."
          : `${message.installedPackage?.name ?? "Package"} ${message.operation} complete.`,
      );
      setConfirmName(undefined);
      void refreshStrategies().finally(requestList);
    });
    const unsubscribeErrors = on("error", (message) => {
      if (message.requestId === requestIdRef.current)
        setStatus(`Error: ${message.message}`);
    });
    requestList();
    return () => {
      unsubscribePackages();
      unsubscribeErrors();
    };
  }, [on, refreshStrategies, requestList]);

  const installedByName = useMemo(
    () => new Map(installed.map((item) => [item.name, item])),
    [installed],
  );
  const filtered = filterByQuery(
    packages,
    query,
    (item) =>
      `${item.name} ${item.description ?? ""} ${(item.keywords ?? []).join(" ")}`,
  );

  const mutate = useCallback(
    (
      type: "hub_install" | "hub_update" | "hub_remove",
      item: HubPackage,
      allowCode = false,
    ): void => {
      const requestId = crypto.randomUUID();
      requestIdRef.current = requestId;
      setStatus(
        `${type === "hub_remove" ? "Removing" : type === "hub_update" ? "Updating" : "Installing"} ${item.name}...`,
      );
      send({
        type,
        name: item.name,
        requestId,
        ...(type !== "hub_remove" ? { allowCode } : {}),
      });
    },
    [send],
  );

  useInput(
    (input, key) => {
      if (input && isMouseEscape(input)) return;
      if (key.escape) {
        onBack();
        return;
      }
      if (key.upArrow) {
        setSelectedIndex((index) => Math.max(0, index - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedIndex((index) => Math.min(filtered.length - 1, index + 1));
        return;
      }
      if (key.backspace || key.delete) {
        setQuery((value) => value.slice(0, -1));
        setSelectedIndex(0);
        return;
      }
      const selected = filtered[selectedIndex];
      if (input === "d" && selected && installedByName.has(selected.name)) {
        mutate("hub_remove", selected);
        return;
      }
      if (key.return && selected) {
        const current = installedByName.get(selected.name);
        const action = current ? "hub_update" : "hub_install";
        if (
          selected.permissions?.executesCode &&
          confirmName !== selected.name
        ) {
          setConfirmName(selected.name);
          setStatus(
            `Executable code requested by ${selected.name}. Press Enter again to approve.`,
          );
          return;
        }
        mutate(action, selected, confirmName === selected.name);
        return;
      }
      if (
        input &&
        !key.ctrl &&
        !key.meta &&
        !key.tab &&
        !key.escape &&
        !key.return
      ) {
        setQuery((value) => value + input);
        setSelectedIndex(0);
        setConfirmName(undefined);
      }
    },
    { isActive: isFocused },
  );

  return (
    <HubPackagesPageRender
      tokens={tokens}
      searchTheme={searchTheme}
      packages={packages}
      filtered={filtered}
      installedByName={installedByName}
      query={query}
      selectedIndex={selectedIndex}
      onSelectedIndexChange={setSelectedIndex}
      status={status}
    />
  );
}

export interface HubPackagesPageRenderProps {
  /** Theme tokens used to style package status and selection. */
  readonly tokens: ReturnType<typeof useTheme>;
  /** Resolved theme for the package search field. */
  readonly searchTheme: ReturnType<typeof useSearchInputTheme>;
  /** Complete package list, used to distinguish loading from no matches. */
  readonly packages: readonly HubPackage[];
  /** Packages matching the current search query. */
  readonly filtered: readonly HubPackage[];
  /** Installed packages keyed by package name. */
  readonly installedByName: ReadonlyMap<string, InstalledPackage>;
  /** Current package search query. */
  readonly query: string;
  /** Index of the highlighted package. */
  readonly selectedIndex: number;
  /** Update the highlighted package index. */
  readonly onSelectedIndexChange: (index: number) => void;
  /** Current loading, mutation, or error status. */
  readonly status: string;
}

/** Presentational package browser used by the command-palette page. */
export function HubPackagesPageRender({
  tokens,
  searchTheme,
  packages,
  filtered,
  installedByName,
  query,
  selectedIndex,
  onSelectedIndexChange,
  status,
}: HubPackagesPageRenderProps): React.ReactElement {
  return (
    <Box flexDirection="column" width="100%" flexGrow={1}>
      <Box marginBottom={1}>
        <SearchInputRender
          theme={searchTheme}
          value={query}
          placeholder="Search Hub packages..."
          prompt="› "
        />
      </Box>
      <ScrollableList
        items={filtered}
        getKey={(item) => item.name}
        selectedIndex={selectedIndex}
        onSelectedIndexChange={onSelectedIndexChange}
        isFocused={false}
        emptyText={
          packages.length === 0
            ? status || "No packages available"
            : "No packages match"
        }
        renderItem={(item, isSelected) => {
          const current = installedByName.get(item.name);
          const state = current
            ? current.version === item.version
              ? "installed"
              : `update ${current.version} → ${item.version}`
            : "available";
          const permissions = Object.entries(item.permissions ?? {})
            .filter(([, enabled]) => enabled)
            .map(([name]) => name)
            .join(", ");
          return (
            <Box
              flexDirection="column"
              paddingX={1}
              backgroundColor={isSelected ? tokens.colors.surface : undefined}
            >
              <Text bold={isSelected} color={tokens.colors.primary}>
                {item.name}@{item.version}{" "}
                <Text
                  color={current ? tokens.colors.success : tokens.colors.muted}
                >
                  [{state}]
                </Text>
              </Text>
              <Text color={tokens.colors.muted}>
                {item.description ?? "No description"}
                {permissions ? ` · permissions: ${permissions}` : ""}
              </Text>
            </Box>
          );
        }}
      />
      <Box marginTop={1} flexDirection="column">
        <Text
          color={
            status.startsWith("Error:")
              ? tokens.colors.error
              : tokens.colors.muted
          }
        >
          {status || "Enter install/update · d remove · Esc back"}
        </Text>
      </Box>
    </Box>
  );
}
