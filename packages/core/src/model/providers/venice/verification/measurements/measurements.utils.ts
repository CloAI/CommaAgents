import { createHash } from "node:crypto";
import { z } from "zod";
import { privacyError } from "../../../../privacy/privacy.utils";
import { DstackEventSchema } from "./measurements.schemas";
import type { DstackEvent } from "./measurements.types";

/** Parse provider JSON fields without including malformed evidence in errors.
 * @param {unknown} value - Inline object or JSON string.
 * @returns {unknown} Parsed JSON value.
 */
export function parseMeasurementJSON(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw privacyError("PRIVACY_MEASUREMENTS_INVALID");
  }
}

/** Replay the dstack runtime log using its measured event encoding, not supplied digests.
 * @param {unknown} value - Inline event array or JSON-encoded array.
 * @returns {{events: DstackEvent[]; digest: Uint8Array}} Parsed events and recomputed RTMR3.
 */
export function replayRuntimeMeasurements(value: unknown): {
  events: DstackEvent[];
  digest: Uint8Array;
} {
  if (value === undefined) {
    throw privacyError("PRIVACY_MEASUREMENTS_UNAVAILABLE");
  }
  const parsed = z
    .array(DstackEventSchema)
    .max(4096)
    .safeParse(parseMeasurementJSON(value));
  if (!parsed.success) {
    throw privacyError("PRIVACY_MEASUREMENTS_INVALID");
  }
  const events = parsed.data.filter((event) => event.imr === 3);
  if (!events.length) {
    throw privacyError("PRIVACY_MEASUREMENTS_UNAVAILABLE");
  }
  let digest: Uint8Array = new Uint8Array(48);
  for (const event of events) {
    if (event.event_type !== 0x08000001) {
      throw privacyError("PRIVACY_MEASUREMENTS_INVALID");
    }
    const eventType = Buffer.alloc(4);
    eventType.writeUInt32LE(event.event_type);
    const eventDigest = createHash("sha384")
      .update(eventType)
      .update(":")
      .update(event.event)
      .update(":")
      .update(Buffer.from(event.event_payload, "hex"))
      .digest();
    if (
      event.digest &&
      event.digest.toLowerCase() !== eventDigest.toString("hex")
    ) {
      throw privacyError("PRIVACY_MEASUREMENTS_INVALID");
    }
    digest = createHash("sha384").update(digest).update(eventDigest).digest();
  }
  return { events, digest };
}

/** Canonicalize JSON deployment actions for their attested SHA-256 digest.
 * @param {unknown} value - JSON-only deployment action value.
 * @returns {string} Deterministic JSON with sorted object keys.
 */
export function canonicalMeasurementJSON(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalMeasurementJSON).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(
        ([key, child]) =>
          `${JSON.stringify(key)}:${canonicalMeasurementJSON(child)}`,
      )
      .join(",")}}`;
  }
  if (
    value === undefined ||
    (typeof value === "number" && !Number.isFinite(value))
  ) {
    throw privacyError("PRIVACY_MEASUREMENTS_INVALID");
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) {
    throw privacyError("PRIVACY_MEASUREMENTS_INVALID");
  }
  return encoded;
}
