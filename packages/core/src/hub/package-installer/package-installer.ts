import { mkdir, mkdtemp, readFile, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { extractHubPackageArchive } from "../archive";
import { CommaProjectManifestSchema } from "../hub.schema";
import type { InstalledHubPackage } from "../hub.types";
import type {
  CreateHubPackageInstallerOptions,
  HubPackageInstaller,
} from "./package-installer.types";

/** Create the transaction that validates and installs Hub packages. */
export function createHubPackageInstaller({
  packagesRoot,
  installedPackages,
  registryClient,
}: CreateHubPackageInstallerOptions): HubPackageInstaller {
  return {
    async install(project, snapshot, options, replace) {
      if (
        project.permissions?.executesCode === true &&
        options.allowCode !== true
      ) {
        throw new Error(
          `Package ${project.name} contains executable code; pass allowCode: true to install it`,
        );
      }

      const existingPackage = await installedPackages.get(project.name);
      if (existingPackage && !replace)
        throw new Error(`Package ${project.name} is already installed`);

      const stagingRoot = await mkdtemp(join(tmpdir(), "comma-hub-"));
      const stagedPackagePath = join(stagingRoot, "package");
      const destinationPath = join(packagesRoot, ...project.name.split("/"));
      const backupPath = `${destinationPath}.${crypto.randomUUID()}.backup`;
      let destinationReplaced = false;

      try {
        await mkdir(stagedPackagePath, { recursive: true });
        await extractHubPackageArchive(
          await registryClient.fetchArchive(snapshot.commit),
          project.name,
          stagedPackagePath,
        );

        const manifest = CommaProjectManifestSchema.safeParse(
          JSON.parse(
            await readFile(
              join(stagedPackagePath, "comma-project.json"),
              "utf8",
            ),
          ),
        );
        if (
          !manifest.success ||
          manifest.data.name !== project.name ||
          manifest.data.version !== project.version
        ) {
          throw new Error(
            `Installed manifest does not match registry entry for ${project.name}`,
          );
        }
        if (
          manifest.data.permissions?.executesCode !==
          project.permissions?.executesCode
        ) {
          throw new Error(
            `Installed manifest permissions do not match registry entry for ${project.name}`,
          );
        }
        if (
          manifest.data.dependencies &&
          Object.keys(manifest.data.dependencies).length > 0
        ) {
          throw new Error(
            `Package dependencies are not supported in v1: ${project.name}`,
          );
        }

        await mkdir(dirname(destinationPath), { recursive: true });
        if (existingPackage) await rename(destinationPath, backupPath);
        await rename(stagedPackagePath, destinationPath);
        destinationReplaced = true;

        const installedPackage: InstalledHubPackage = {
          name: project.name,
          version: project.version,
          commit: snapshot.commit,
          path: destinationPath,
          executableCodeApproved: project.permissions?.executesCode === true,
        };
        await installedPackages.replace(installedPackage);
        await rm(backupPath, { recursive: true, force: true });
        return installedPackage;
      } catch (error) {
        try {
          if (destinationReplaced) {
            await rm(destinationPath, { recursive: true, force: true });
          }
          if (existingPackage && (await stat(backupPath)).isDirectory()) {
            await rename(backupPath, destinationPath);
          }
        } catch {}
        throw error;
      } finally {
        await rm(stagingRoot, { recursive: true, force: true });
        await rm(backupPath, { recursive: true, force: true });
      }
    },
  };
}
