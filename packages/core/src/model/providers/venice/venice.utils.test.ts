import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { authenticateReceipt } from "./venice.utils";
import { generateVeniceKeyPair } from "./venice.crypto";

describe("Venice completion binding", () => {
  it("should authenticate exact request and response bytes and reject signed but unrelated hashes", () => {
    const signer = generateVeniceKeyPair();
    const request = '{"model":"example","messages":[]}';
    const response = Buffer.from(
      'data: {"answer":"hello"}\n\ndata: [DONE]\n\n',
    );
    const text = `${createHash("sha256").update(request).digest("hex")}:${createHash("sha256").update(response).digest("hex")}`;
    const digest = keccak_256(
      Buffer.concat([
        Buffer.from(`\x19Ethereum Signed Message:\n${Buffer.byteLength(text)}`),
        Buffer.from(text),
      ]),
    );
    const signed = secp256k1.sign(digest, signer.privateKey, {
      prehash: false,
      format: "recovered",
    });
    const signature = Buffer.concat([
      signed.subarray(1),
      Buffer.from([signed[0]! + 27]),
    ]).toString("hex");
    const receipt = { request_id: "completion", text, signature };
    const attestation = {
      model: "example",
      nonce: "challenge",
      intel_quote: "unused",
    };
    expect(() =>
      authenticateReceipt(
        receipt,
        request,
        response,
        "completion",
        attestation,
        signer.publicKey,
      ),
    ).not.toThrow();
    expect(() =>
      authenticateReceipt(
        receipt,
        `${request} `,
        response,
        "completion",
        attestation,
        signer.publicKey,
      ),
    ).toThrow("Required cryptographic evidence binding is unavailable");
    expect(() =>
      authenticateReceipt(
        receipt,
        request,
        Buffer.from(response.toString().replace(/\n/g, "\r\n")),
        "completion",
        attestation,
        signer.publicKey,
      ),
    ).toThrow("Required cryptographic evidence binding is unavailable");
    expect(() =>
      authenticateReceipt(
        receipt,
        request,
        response,
        "different-completion",
        attestation,
        signer.publicKey,
      ),
    ).toThrow("Completion authentication failed");
    expect(() =>
      authenticateReceipt(
        receipt,
        request,
        response,
        "completion",
        attestation,
        generateVeniceKeyPair().publicKey,
      ),
    ).toThrow("Completion authentication failed");
    signer.privateKey.fill(0);
  });
});
