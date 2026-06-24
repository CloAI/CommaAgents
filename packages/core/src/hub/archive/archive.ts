import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

import { extract } from "tar-stream";

import { HUB_MAX_FILES, HUB_MAX_UNCOMPRESSED_BYTES } from "../hub.constants";

/** Extract one Hub package from a compressed repository archive. */
export async function extractHubPackageArchive(
  compressedArchive: Uint8Array,
  packageName: string,
  destination: string,
): Promise<void> {
  const unpackedArchive = Bun.gunzipSync(
    compressedArchive.buffer as ArrayBuffer,
  );
  const archive = extract();
  const packageMarker = `/packages/${packageName}/`;
  let fileCount = 0;
  let byteCount = 0;
  let foundManifest = false;

  await new Promise<void>((resolveExtraction, rejectExtraction) => {
    archive.on("entry", (header, stream, next) => {
      const markerIndex = header.name.indexOf(packageMarker);
      if (markerIndex === -1) {
        stream.resume();
        stream.once("end", next);
        return;
      }

      const relativePath = header.name.slice(
        markerIndex + packageMarker.length,
      );
      if (relativePath.length === 0 || header.type === "directory") {
        stream.resume();
        stream.once("end", next);
        return;
      }
      if (header.type !== "file") {
        rejectExtraction(
          new Error(
            `Hub archive contains unsupported ${header.type} entry: ${relativePath}`,
          ),
        );
        stream.resume();
        return;
      }

      const outputPath = resolve(destination, relativePath);
      const relativeOutputPath = relative(
        resolve(destination),
        resolve(outputPath),
      );
      if (
        relativeOutputPath === "" ||
        relativeOutputPath === ".." ||
        relativeOutputPath.startsWith(`..${sep}`)
      ) {
        rejectExtraction(
          new Error(`Hub archive path escapes package root: ${relativePath}`),
        );
        stream.resume();
        return;
      }

      fileCount += 1;
      byteCount += header.size ?? 0;
      if (fileCount > HUB_MAX_FILES || byteCount > HUB_MAX_UNCOMPRESSED_BYTES) {
        rejectExtraction(new Error("Hub package exceeds extraction limits"));
        stream.resume();
        return;
      }

      void mkdir(dirname(outputPath), { recursive: true })
        .then(() => {
          if (relativePath === "comma-project.json") foundManifest = true;
          const output = createWriteStream(outputPath, { flags: "wx" });
          output.once("error", rejectExtraction);
          output.once("finish", next);
          stream.once("error", rejectExtraction);
          stream.pipe(output);
        })
        .catch(rejectExtraction);
    });
    archive.once("finish", () => {
      if (!foundManifest) {
        rejectExtraction(
          new Error(`Package ${packageName} was not found in the Hub archive`),
        );
        return;
      }
      resolveExtraction();
    });
    archive.once("error", rejectExtraction);
    archive.end(unpackedArchive);
  });
}
