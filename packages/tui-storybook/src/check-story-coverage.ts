import { access, readdir, readFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const COMPONENTS_DIRECTORY = fileURLToPath(
  new URL("../../tui/src/components/", import.meta.url),
);
const PAGES_DIRECTORY = fileURLToPath(
  new URL("../../tui/src/pages/", import.meta.url),
);

const NON_VISUAL_COMPONENT_MODULES = new Set([
  // These command pages perform an immediate application effect and render null.
  "CommandPalette/pages/ExitPage/ExitPage.tsx",
  "CommandPalette/pages/NewRunPage/NewRunPage.tsx",
  // These providers only attach behavior to their children; they own no visual state.
  "CommandPalette/useCommandPalette/useCommandPalette.context.tsx",
  "MouseProvider/MouseProvider.tsx",
]);

/** Recursively collect visual source modules from one TUI source directory. */
async function collectSourceModules(directory: string): Promise<string[]> {
  const directoryEntries = await readdir(directory, { withFileTypes: true });
  const nestedPaths = await Promise.all(
    directoryEntries.map(async (directoryEntry): Promise<string[]> => {
      const entryPath = join(directory, directoryEntry.name);
      if (directoryEntry.isDirectory()) {
        return collectSourceModules(entryPath);
      }
      if (
        directoryEntry.name.endsWith(".tsx") &&
        !directoryEntry.name.endsWith(".stories.tsx") &&
        !directoryEntry.name.endsWith(".test.tsx")
      ) {
        return [entryPath];
      }
      return [];
    }),
  );
  return nestedPaths.flat();
}

interface VisualModule {
  readonly sourcePath: string;
  readonly sourceDirectory: string;
  readonly displayPath: string;
}

const componentModules = await collectSourceModules(COMPONENTS_DIRECTORY);
const visualComponentModules = componentModules
  .filter(
    (componentPath) =>
      !NON_VISUAL_COMPONENT_MODULES.has(
        relative(COMPONENTS_DIRECTORY, componentPath),
      ),
  )
  .sort();
const pageModules = (await collectSourceModules(PAGES_DIRECTORY)).sort();
const visualModules: readonly VisualModule[] = [
  ...visualComponentModules.map((sourcePath) => ({
    sourcePath,
    sourceDirectory: COMPONENTS_DIRECTORY,
    displayPath: `components/${relative(COMPONENTS_DIRECTORY, sourcePath)}`,
  })),
  ...pageModules.map((sourcePath) => ({
    sourcePath,
    sourceDirectory: PAGES_DIRECTORY,
    displayPath: `pages/${relative(PAGES_DIRECTORY, sourcePath)}`,
  })),
];
const missingStories: string[] = [];
const invalidStories: string[] = [];

for (const visualModule of visualModules) {
  const moduleName = basename(visualModule.sourcePath, ".tsx");
  const storyPath = visualModule.sourcePath.replace(/\.tsx$/u, ".stories.tsx");

  try {
    await access(storyPath);
  } catch {
    missingStories.push(visualModule.displayPath);
    continue;
  }

  const storySource = await readFile(storyPath, "utf8");
  if (
    !storySource.includes(`from "./${moduleName}"`) &&
    !storySource.includes(`from './${moduleName}'`)
  ) {
    invalidStories.push(relative(visualModule.sourceDirectory, storyPath));
  }
}

if (missingStories.length > 0 || invalidStories.length > 0) {
  const details = [
    ...missingStories.map((path) => `missing story: ${path}`),
    ...invalidStories.map(
      (path) => `story does not import its component: ${path}`,
    ),
  ];
  throw new Error(
    `TUI Storybook coverage check failed:\n${details.join("\n")}`,
  );
}

const visualModuleCount = visualModules.length;
process.stdout.write(
  `TUI Storybook coverage: ${visualModuleCount}/${visualModuleCount} visual modules covered (${visualComponentModules.length} components, ${pageModules.length} pages; ${NON_VISUAL_COMPONENT_MODULES.size} non-visual exclusions).\n`,
);
