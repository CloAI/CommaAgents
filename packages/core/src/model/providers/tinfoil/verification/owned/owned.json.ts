/** Parse bounded UTF-8 JSON, rejecting duplicate names and preserving large integer values.
 * @param {Uint8Array} bytes - Original document or signed payload bytes.
 * @returns {unknown} Strictly decoded JSON value.
 */
function parseJSONDocument(bytes: Uint8Array) {
  const fields = new Map<string, string>();
  const source = new TextDecoder("utf-8", {
    fatal: true,
    ignoreBOM: true,
  }).decode(bytes);
  let position = 0;
  let nodes = 0;
  const fail = () => {
    throw new Error("Invalid attestation JSON");
  };
  const whitespace = () => {
    while (/[ \t\r\n]/.test(source[position] ?? "x")) {
      position++;
    }
  };
  const string = (): string => {
    const start = position++;
    for (; position < source.length; position++) {
      if (source[position] === '"') {
        const value = JSON.parse(source.slice(start, ++position)) as string;
        if (
          /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
            value,
          )
        ) {
          fail();
        }
        return value;
      }
      if (source[position] === "\\") {
        position++;
      }
    }
    return fail();
  };
  const value = (depth: number): unknown => {
    if (depth > 64 || ++nodes > 100000) {
      fail();
    }
    whitespace();
    const token = source[position];
    if (token === '"') {
      return string();
    }
    if (token === "{") {
      position++;
      whitespace();
      const object: Record<string, unknown> = Object.create(null) as Record<
        string,
        unknown
      >;
      if (source[position] === "}") {
        position++;
        return object;
      }
      for (;;) {
        whitespace();
        if (source[position] !== '"') {
          fail();
        }
        const name = string();
        if (
          ["__proto__", "prototype", "constructor"].includes(name) ||
          Object.hasOwn(object, name)
        ) {
          fail();
        }
        whitespace();
        if (source[position++] !== ":") {
          fail();
        }
        whitespace();
        const start = position;
        object[name] = value(depth + 1);
        if (depth === 0) {
          fields.set(name, source.slice(start, position));
        }
        whitespace();
        const separator = source[position++];
        if (separator === "}") {
          return object;
        }
        if (separator !== ",") {
          fail();
        }
      }
    }
    if (token === "[") {
      position++;
      whitespace();
      const array: unknown[] = [];
      if (source[position] === "]") {
        position++;
        return array;
      }
      for (;;) {
        array.push(value(depth + 1));
        whitespace();
        const separator = source[position++];
        if (separator === "]") {
          return array;
        }
        if (separator !== ",") {
          fail();
        }
      }
    }
    for (const [literal, decoded] of [
      ["true", true],
      ["false", false],
      ["null", null],
    ] as const) {
      if (source.startsWith(literal, position)) {
        position += literal.length;
        return decoded;
      }
    }
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(
      source.slice(position),
    );
    if (!match) {
      return fail();
    }
    position += match[0].length;
    if (/^-?[0-9]+$/.test(match[0])) {
      const integer = BigInt(match[0]);
      return integer >= BigInt(Number.MIN_SAFE_INTEGER) &&
        integer <= BigInt(Number.MAX_SAFE_INTEGER)
        ? Number(integer)
        : integer;
    }
    const number = Number(match[0]);
    if (
      !Number.isFinite(number) ||
      (Number.isInteger(number) && !Number.isSafeInteger(number))
    ) {
      fail();
    }
    return number;
  };
  const result = value(0);
  whitespace();
  if (position !== source.length) {
    fail();
  }
  return { value: result, fields };
}

/** Decode canonical RFC 4648 base64 without accepting alternate encodings.
 * @param {string} encoded - Original base64 field.
 * @returns {Uint8Array} Exact decoded bytes.
 */
export function decodeTinfoilBase64(encoded: string): Uint8Array {
  if (encoded.length % 4 !== 0 || encoded.length > 4 * 1024 * 1024) {
    throw new Error("Invalid attestation base64");
  }
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.toString("base64") !== encoded) {
    throw new Error("Invalid attestation base64");
  }
  return bytes;
}

/** Parse strict JSON without losing integer precision or accepting duplicate object names.
 * @param {Uint8Array} bytes - Exact original UTF-8 bytes.
 * @returns {unknown} Parsed value.
 */
export function parseTinfoilJSON(bytes: Uint8Array): unknown {
  return parseJSONDocument(bytes).value;
}

/** Preserve an Intel-signed object's exact original JSON bytes, including whitespace and property order.
 * @param {Uint8Array} bytes - Strictly validated signed envelope.
 * @param {string} field - Root-level signed object name.
 * @returns {string} Exact object encoding; no reserialization occurs.
 */
export function readTinfoilSignedJSONObject(
  bytes: Uint8Array,
  field: string,
): string {
  const value = parseJSONDocument(bytes).fields.get(field);
  if (!value?.startsWith("{") || !value.endsWith("}")) {
    throw new Error("Missing signed JSON object");
  }
  return value;
}
