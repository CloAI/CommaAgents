import { describe, expect, it } from "bun:test";
import { createCipheriv, hkdfSync } from "node:crypto";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import {
  decryptVeniceChunk,
  deriveVeniceAddress,
  encryptVeniceMessage,
  encryptVeniceMessages,
  generateVeniceKeyPair,
  verifyVeniceSignature,
} from "./venice.crypto";

describe("Venice cryptography", () => {
  it("should combine system instructions before encrypting every message including empty assistant history", () => {
    const recipient = generateVeniceKeyPair();
    const messages = [
      { role: "system", content: "Private tool instructions" },
      { role: "system", content: "Private agent instructions" },
      { role: "user", content: "Private question" },
      { role: "assistant", content: "" },
      { role: "user", content: "Private result" },
    ];
    const encrypted = encryptVeniceMessages(messages, recipient.publicKey);
    expect(encrypted.map((message) => message.role)).toEqual([
      "system",
      "user",
      "assistant",
      "user",
    ]);
    expect(
      encrypted.map((message) =>
        decryptVeniceChunk(message.content as string, recipient.privateKey),
      ),
    ).toEqual([
      "Private tool instructions\n\nPrivate agent instructions",
      "Private question",
      "",
      "Private result",
    ]);
    for (const message of encrypted) {
      expect(message.content).toMatch(/^[a-f0-9]+$/);
    }
    expect(JSON.stringify(encrypted)).not.toContain("Private");
    expect(messages).toHaveLength(5);
    recipient.privateKey.fill(0);
  });

  it("should reject unnormalized message content and plaintext side fields before encryption", () => {
    const recipient = generateVeniceKeyPair();
    for (const message of [
      { role: "user", content: undefined },
      { role: "user", content: { text: "private" } },
      { role: "assistant", content: "private", tool_calls: [] },
      { role: "tool", content: "private" },
    ]) {
      expect(() =>
        encryptVeniceMessages([message], recipient.publicKey),
      ).toThrow();
    }
    recipient.privateKey.fill(0);
  });

  it("should derive the established Ethereum address for the generator public key", () => {
    const privateKey = new Uint8Array(32);
    privateKey[31] = 1;
    expect(
      Buffer.from(
        deriveVeniceAddress(secp256k1.getPublicKey(privateKey, false)),
      ).toString("hex"),
    ).toBe("7e5f4552091a69125d5dfcb7b8c2659029395bdf");
  });

  it("should interoperate with an independent fixed-key AES-GCM envelope", () => {
    const recipient = generateVeniceKeyPair();
    const senderPrivateKey = new Uint8Array(32);
    senderPrivateKey[31] = 1;
    const senderPublicKey = secp256k1.getPublicKey(senderPrivateKey, false);
    const sharedSecret = secp256k1
      .getSharedSecret(senderPrivateKey, recipient.publicKey, false)
      .slice(1, 33);
    const aesKey = Buffer.from(
      hkdfSync(
        "sha256",
        sharedSecret,
        Buffer.alloc(0),
        Buffer.from("ecdsa_encryption"),
        32,
      ),
    );
    const nonce = Buffer.alloc(12, 7);
    const cipher = createCipheriv("aes-256-gcm", aesKey, nonce);
    const ciphertext = Buffer.concat([
      cipher.update("Hello, 世界 🌍", "utf8"),
      cipher.final(),
    ]);
    const envelope = Buffer.concat([
      senderPublicKey,
      nonce,
      ciphertext,
      cipher.getAuthTag(),
    ]).toString("hex");
    expect(decryptVeniceChunk(envelope, recipient.privateKey)).toBe(
      "Hello, 世界 🌍",
    );
  });

  it("should use fresh per-message ephemeral keys and preserve the caller's private key", () => {
    const recipient = generateVeniceKeyPair();
    const originalKey = recipient.privateKey.slice();
    const first = encryptVeniceMessage("a private prompt", recipient.publicKey);
    const second = encryptVeniceMessage(
      "a private prompt",
      recipient.publicKey,
    );
    expect(first).not.toBe(second);
    expect(first.slice(0, 130)).not.toBe(second.slice(0, 130));
    expect(decryptVeniceChunk(first, recipient.privateKey)).toBe(
      "a private prompt",
    );
    expect(decryptVeniceChunk(second, recipient.privateKey)).toBe(
      "a private prompt",
    );
    expect(recipient.privateKey).toEqual(originalKey);
  });

  it("should reject tampered ciphertext, invalid keys, plaintext, and malformed hex", () => {
    const recipient = generateVeniceKeyPair();
    const ciphertext = encryptVeniceMessage("private", recipient.publicKey);
    const tampered = Buffer.from(ciphertext, "hex");
    tampered[tampered.length - 1]! ^= 1;
    for (const content of [
      "private",
      "f".repeat(187),
      "gg".repeat(100),
      ciphertext.toUpperCase(),
      tampered.toString("hex"),
    ]) {
      expect(() => decryptVeniceChunk(content, recipient.privateKey)).toThrow(
        "Completion authentication failed",
      );
    }
    expect(() =>
      decryptVeniceChunk(ciphertext, generateVeniceKeyPair().privateKey),
    ).toThrow();
    expect(() => encryptVeniceMessage("private", new Uint8Array(65))).toThrow();
    expect(() => deriveVeniceAddress(new Uint8Array(65))).toThrow();
  });

  it("should verify exact EIP-191 text with UTF-8 byte length and bind the recovery bit", () => {
    const signer = generateVeniceKeyPair();
    const text = "signed 世界 🌍\n";
    const bytes = Buffer.from(text, "utf8");
    const digest = keccak_256(
      Buffer.concat([
        Buffer.from(`\x19Ethereum Signed Message:\n${bytes.length}`),
        bytes,
      ]),
    );
    const recovered = secp256k1.sign(digest, signer.privateKey, {
      prehash: false,
      format: "recovered",
    });
    const signature = Buffer.concat([
      recovered.subarray(1),
      Buffer.from([recovered[0]! + 27]),
    ]).toString("hex");
    expect(verifyVeniceSignature(text, signature, signer.publicKey)).toBe(true);
    expect(
      verifyVeniceSignature(text, `0x${signature}`, signer.publicKey),
    ).toBe(true);
    expect(
      verifyVeniceSignature(text.trim(), signature, signer.publicKey),
    ).toBe(false);
    expect(
      verifyVeniceSignature(text, signature, generateVeniceKeyPair().publicKey),
    ).toBe(false);
    const tampered = Buffer.from(signature, "hex");
    tampered[64] = tampered[64] === 27 ? 28 : 27;
    expect(
      verifyVeniceSignature(text, tampered.toString("hex"), signer.publicKey),
    ).toBe(false);
    expect(verifyVeniceSignature(text, "f".repeat(130), signer.publicKey)).toBe(
      false,
    );
  });
});
