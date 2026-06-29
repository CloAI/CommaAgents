import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTheme } from "../../../../Theme";
import { useSearchInputTheme } from "../../../SearchInput";
import {
  HubPackagesPageRender,
  type HubPackagesPageRenderProps,
} from "./HubPackagesPage";

const PACKAGES: HubPackagesPageRenderProps["packages"] = [
  {
    name: "@comma/code-review",
    version: "2.1.0",
    description: "Plan, review, and validate a repository change.",
    path: "packages/code-review",
    keywords: ["review", "quality"],
    exports: { strategies: [], agents: [], flows: [], tools: [] },
  },
  {
    name: "@comma/release-notes",
    version: "1.4.0",
    description: "Generate release notes from repository history.",
    path: "packages/release-notes",
    keywords: ["release", "docs"],
    exports: { strategies: [], agents: [], flows: [], tools: [] },
  },
  {
    name: "@comma/workspace-tools",
    version: "3.0.0",
    description: "Workspace inspection tools with executable extensions.",
    path: "packages/workspace-tools",
    permissions: { filesystem: true, executesCode: true },
    exports: { strategies: [], agents: [], flows: [], tools: [] },
  },
];

const INSTALLED: HubPackagesPageRenderProps["installedByName"] = new Map([
  [
    "@comma/code-review",
    {
      name: "@comma/code-review",
      version: "2.1.0",
      commit: "a1b2c3d",
      path: "/tmp/comma/code-review",
      executableCodeApproved: false,
    },
  ],
  [
    "@comma/release-notes",
    {
      name: "@comma/release-notes",
      version: "1.2.0",
      commit: "d4e5f6a",
      path: "/tmp/comma/release-notes",
      executableCodeApproved: false,
    },
  ],
]);

interface HubPackagesPageStoryProps {
  readonly query: string;
  readonly selectedIndex: number;
  readonly status: string;
}

function HubPackagesPageStory({
  query,
  selectedIndex,
  status,
}: HubPackagesPageStoryProps): React.ReactElement {
  const tokens = useTheme();
  const searchTheme = useSearchInputTheme();
  const filtered = PACKAGES.filter((hubPackage) =>
    hubPackage.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <HubPackagesPageRender
      tokens={tokens}
      searchTheme={searchTheme}
      packages={PACKAGES}
      filtered={filtered}
      installedByName={INSTALLED}
      query={query}
      selectedIndex={selectedIndex}
      onSelectedIndexChange={() => {}}
      status={status}
    />
  );
}

const meta: Meta<typeof HubPackagesPageStory> = {
  title: "Components/CommandPalette/HubPackagesPage",
  component: HubPackagesPageStory,
  args: { query: "", selectedIndex: 0, status: "" },
  parameters: { xterm: { cols: 90, rows: 18 } },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const AvailableAndInstalled: Story = {};

export const ExecutableCodePermission: Story = {
  args: {
    selectedIndex: 2,
    status:
      "Executable code requested by @comma/workspace-tools. Press Enter again to approve.",
  },
};

export const NoMatches: Story = {
  args: { query: "missing" },
};
