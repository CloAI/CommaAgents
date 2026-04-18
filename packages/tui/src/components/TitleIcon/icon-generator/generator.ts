import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSTL } from "@amandaghassaei/stl-parser";
import { mat4, vec3, vec4 } from "gl-matrix";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Frames per second for the animation. */
const FPS = 15;

/** Duration of one full rotation in seconds. */
const ROTATION_DURATION_S = 4;

/** Total frames for one full 360° rotation. */
const TOTAL_FRAMES = FPS * ROTATION_DURATION_S;

/** Width of the ASCII canvas in columns. */
const WIDTH = 40;

/** Height of the ASCII canvas in rows (half of width — terminal chars are ~2:1). */
const HEIGHT = 20;

/**
 * Classic ASCII brightness ramp — darkest to brightest.
 * Characters chosen for visually increasing "density".
 */
const ASCII_RAMP = " .:-=+*#%@";

// ---------------------------------------------------------------------------
// Helpers — 3-component vector math (avoids gl-matrix allocation per pixel)
// ---------------------------------------------------------------------------

type Vec3 = [number, number, number];

function dotVec3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalizeVec3(v: Vec3): Vec3 {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

// ---------------------------------------------------------------------------
// Triangle rasteriser
// ---------------------------------------------------------------------------

interface ProjectedTriangle {
  /** Screen-space vertices (x, y) + depth z. */
  v0: Vec3;
  v1: Vec3;
  v2: Vec3;
  /** Brightness in 0..1 computed from face normal · light direction. */
  brightness: number;
}

/**
 * Compute the signed area × 2 of triangle (a,b,c) in screen space.
 * Used for barycentric coordinate calculation during rasterisation.
 */
function edgeFunction(a: Vec3, b: Vec3, c: Vec3): number {
  return (c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0]);
}

/**
 * Rasterise a list of projected triangles into a WIDTH×HEIGHT character grid.
 * Uses a depth buffer so closer faces occlude farther ones.
 */
function rasterise(triangles: ProjectedTriangle[]): string[] {
  // Depth buffer initialised to +Infinity (far plane).
  const depthBuf: number[][] = Array.from({ length: HEIGHT }, () =>
    Array.from({ length: WIDTH }, () => Number.POSITIVE_INFINITY),
  );

  // Brightness buffer initialised to 0 (background).
  const brightBuf: number[][] = Array.from({ length: HEIGHT }, () =>
    Array.from({ length: WIDTH }, () => 0),
  );

  for (const tri of triangles) {
    const { v0, v1, v2, brightness } = tri;

    // Bounding box (clamped to canvas).
    const minX = Math.max(0, Math.floor(Math.min(v0[0], v1[0], v2[0])));
    const maxX = Math.min(WIDTH - 1, Math.ceil(Math.max(v0[0], v1[0], v2[0])));
    const minY = Math.max(0, Math.floor(Math.min(v0[1], v1[1], v2[1])));
    const maxY = Math.min(HEIGHT - 1, Math.ceil(Math.max(v0[1], v1[1], v2[1])));

    const area = edgeFunction(v0, v1, v2);
    if (Math.abs(area) < 1e-6) continue; // degenerate triangle

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const p: Vec3 = [x + 0.5, y + 0.5, 0];

        const w0 = edgeFunction(v1, v2, p);
        const w1 = edgeFunction(v2, v0, p);
        const w2 = edgeFunction(v0, v1, p);

        // Check if point is inside triangle (consistent winding).
        if (area > 0) {
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        } else {
          if (w0 > 0 || w1 > 0 || w2 > 0) continue;
        }

        // Barycentric interpolation of depth.
        const invArea = 1 / area;
        const depth = (w0 * v0[2] + w1 * v1[2] + w2 * v2[2]) * invArea;

        const row = depthBuf[y];
        const brightRow = brightBuf[y];
        if (row && brightRow && depth < (row[x] ?? Number.POSITIVE_INFINITY)) {
          row[x] = depth;
          brightRow[x] = brightness;
        }
      }
    }
  }

  // Convert brightness buffer to ASCII characters.
  const lines: string[] = [];
  for (let y = 0; y < HEIGHT; y++) {
    let line = "";
    const brightRow = brightBuf[y];
    if (!brightRow) {
      lines.push(" ".repeat(WIDTH));
      continue;
    }
    for (let x = 0; x < WIDTH; x++) {
      const b = brightRow[x] ?? 0;
      const idx = Math.round(b * (ASCII_RAMP.length - 1));
      line += ASCII_RAMP[idx] ?? " ";
    }
    lines.push(line);
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Projection pipeline
// ---------------------------------------------------------------------------

/**
 * Transform a mesh's triangles by the given model-view matrix, compute
 * per-face lighting, project to screen space, and rasterise.
 */
function renderFrame(
  vertices: Float32Array,
  facesIndices: Uint32Array,
  facesNormals: Float32Array,
  modelView: mat4,
): string[] {
  /** Light direction in view space (pointing from top-right-front). */
  const lightDir: Vec3 = normalizeVec3([0.5, 0.8, 1.0]);

  const projected: ProjectedTriangle[] = [];

  const numFaces = facesIndices.length / 3;

  for (let f = 0; f < numFaces; f++) {
    const i0 = facesIndices[f * 3] ?? 0;
    const i1 = facesIndices[f * 3 + 1] ?? 0;
    const i2 = facesIndices[f * 3 + 2] ?? 0;

    // Transform each vertex.
    const transform = (idx: number): Vec3 => {
      const vIn = vec4.fromValues(
        vertices[idx * 3] ?? 0,
        vertices[idx * 3 + 1] ?? 0,
        vertices[idx * 3 + 2] ?? 0,
        1,
      );
      const vOut = vec4.create();
      vec4.transformMat4(vOut, vIn, modelView);
      return [vOut[0], vOut[1], vOut[2]];
    };

    const tv0 = transform(i0);
    const tv1 = transform(i1);
    const tv2 = transform(i2);

    // Compute face normal in view space by transforming the STL normal.
    const nIn = vec3.fromValues(
      facesNormals[f * 3] ?? 0,
      facesNormals[f * 3 + 1] ?? 0,
      facesNormals[f * 3 + 2] ?? 0,
    );

    // Normal matrix = transpose(inverse(upper-left 3×3 of modelView)).
    const normalMat = mat4.create();
    mat4.invert(normalMat, modelView);
    mat4.transpose(normalMat, normalMat);
    const nOut = vec3.create();
    vec3.transformMat4(nOut, nIn, normalMat);
    vec3.normalize(nOut, nOut);

    const normal: Vec3 = [nOut[0], nOut[1], nOut[2]];

    // Back-face culling: if the face normal points away from the camera.
    if (normal[2] < 0) continue;

    // Diffuse lighting.
    const diffuse = Math.max(0, dotVec3(normal, lightDir));
    const ambient = 0.15;
    const brightness = Math.min(1, ambient + diffuse * 0.85);

    // Orthographic projection → screen space.
    const toScreen = (v: Vec3): Vec3 => {
      const sx = (v[0] + 1) * 0.5 * WIDTH;
      const sy = (1 - (v[1] + 1) * 0.5) * HEIGHT; // flip Y
      return [sx, sy, v[2]];
    };

    projected.push({
      v0: toScreen(tv0),
      v1: toScreen(tv1),
      v2: toScreen(tv2),
      brightness,
    });
  }

  return rasterise(projected);
}

// ---------------------------------------------------------------------------
// Main — generate all frames and write frames.json
// ---------------------------------------------------------------------------

function generate(): void {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const stlPath = resolve(currentDir, "comma.stl");
  const outputPath = resolve(currentDir, "frames.json");

  // Load and parse the STL file.
  const stlBuffer = readFileSync(stlPath);
  const mesh = parseSTL(stlBuffer.buffer as ArrayBuffer);

  // Scale to unit bounding box and merge duplicate vertices.
  const normalized = mesh.scaleVerticesToUnitBoundingBox().mergeVertices();

  const { vertices, facesIndices, facesNormals } = normalized;

  // Pre-compute the centre of the bounding box for centring.
  const { min, max } = normalized.boundingBox;
  const cx = (min[0] + max[0]) / 2;
  const cy = (min[1] + max[1]) / 2;
  const cz = (min[2] + max[2]) / 2;

  const frames: string[][] = [];

  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const angle = (i / TOTAL_FRAMES) * Math.PI * 2;

    // Build model-view matrix: centre → rotate Y → slight tilt on X.
    const mv = mat4.create();

    // Pull back slightly so the model fits inside [-1, 1] clip space.
    mat4.translate(mv, mv, [0, 0, 0]);

    // Tilt the model slightly toward the viewer.
    mat4.rotateX(mv, mv, -0.3);

    // Main rotation around the Y axis.
    mat4.rotateY(mv, mv, angle);

    // Centre the model at the origin.
    mat4.translate(mv, mv, [-cx, -cy, -cz]);

    const frameLines = renderFrame(vertices, facesIndices, facesNormals, mv);

    frames.push(frameLines);
  }

  const output = {
    fps: FPS,
    width: WIDTH,
    height: HEIGHT,
    totalFrames: TOTAL_FRAMES,
    ramp: ASCII_RAMP,
    frames,
  };

  writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");

  console.log(`Generated ${TOTAL_FRAMES} frames (${WIDTH}×${HEIGHT}) at ${FPS}fps → ${outputPath}`);
}

generate();
