import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { authenticateReceipt } from "./venice.utils";
import { generateVeniceKeyPair } from "./venice.crypto";
import type { VeniceReceiptChecks } from "./venice.types";

describe("Venice completion binding", () => {
  it("should reject an authentic receipt for a different signed model even when both body hashes match", () => {
    const signer = generateVeniceKeyPair();
    const request = "request";
    const response = Buffer.from("response");
    for (const model of ["approved-upstream", "different-upstream"]) {
      const text = `${model}:${createHash("sha256").update(request).digest("hex")}:${createHash("sha256").update(response).digest("hex")}`;
      const digest = keccak_256(
        Buffer.concat([
          Buffer.from(
            `\x19Ethereum Signed Message:\n${Buffer.byteLength(text)}`,
          ),
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
      let observed: VeniceReceiptChecks | undefined;
      const verify = () =>
        authenticateReceipt(
          { text, signature, requested_request_id: "completion" },
          request,
          response,
          "completion",
          {
            model: "example",
            nonce: "challenge",
            intel_quote: "unused",
            upstream_model: "approved-upstream",
          },
          signer.publicKey,
          (checks) => {
            observed = checks;
          },
        );
      if (model === "approved-upstream") {
        expect(verify).not.toThrow();
      } else {
        expect(verify).toThrow(
          "Required cryptographic evidence binding is unavailable",
        );
      }
      expect(observed).toEqual({
        completionId: "passed",
        signature: "passed",
        model: model === "approved-upstream" ? "passed" : "failed",
        requestBody: "passed",
        responseBody: "passed",
      });
    }
    signer.privateKey.fill(0);
  });

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
    let observed: VeniceReceiptChecks | undefined;
    const onChecks = (checks: VeniceReceiptChecks) => {
      observed = checks;
    };
    expect(() =>
      authenticateReceipt(
        receipt,
        request,
        response,
        "completion",
        attestation,
        signer.publicKey,
        onChecks,
      ),
    ).not.toThrow();
    expect(observed).toEqual({
      completionId: "passed",
      signature: "passed",
      model: "notApplicable",
      requestBody: "passed",
      responseBody: "passed",
    });
    expect(() =>
      authenticateReceipt(
        { requested_request_id: "completion", text, signature },
        request,
        response,
        "completion",
        attestation,
        signer.publicKey,
      ),
    ).not.toThrow();
    for (const identity of [
      {},
      { requested_request_id: "different-completion" },
      {
        request_id: "completion",
        requested_request_id: "different-completion",
      },
      {
        request_id: "different-completion",
        requested_request_id: "completion",
      },
    ]) {
      expect(() =>
        authenticateReceipt(
          { ...identity, text, signature },
          request,
          response,
          "completion",
          attestation,
          signer.publicKey,
        ),
      ).toThrow("Completion authentication failed");
    }
    expect(() =>
      authenticateReceipt(
        { requested_request_id: "completion", text, signature },
        `${request} `,
        response,
        "completion",
        attestation,
        signer.publicKey,
        onChecks,
      ),
    ).toThrow("Required cryptographic evidence binding is unavailable");
    expect(observed).toEqual({
      completionId: "passed",
      signature: "passed",
      model: "notApplicable",
      requestBody: "failed",
      responseBody: "passed",
    });
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
        onChecks,
      ),
    ).toThrow("Required cryptographic evidence binding is unavailable");
    expect(observed).toEqual({
      completionId: "passed",
      signature: "passed",
      model: "notApplicable",
      requestBody: "passed",
      responseBody: "failed",
    });
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
        onChecks,
      ),
    ).toThrow("Completion authentication failed");
    expect(observed).toEqual({
      completionId: "passed",
      signature: "failed",
      model: "notApplicable",
      requestBody: "passed",
      responseBody: "passed",
    });
    expect(() =>
      authenticateReceipt(
        {},
        request,
        response,
        "completion",
        attestation,
        signer.publicKey,
        onChecks,
      ),
    ).toThrow("Completion authentication failed");
    expect(observed).toEqual({
      completionId: "unavailable",
      signature: "unavailable",
      model: "unavailable",
      requestBody: "unavailable",
      responseBody: "unavailable",
    });
    signer.privateKey.fill(0);
  });
});
