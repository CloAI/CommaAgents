import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { privacyError } from "../../privacy/privacy.utils";
import type { VeniceToolRequest } from "./venice.types";

const HKDF_INFO = new TextEncoder().encode("ecdsa_encryption");
const PUBLIC_KEY_BYTES = 65;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/** Combine system instructions before encrypting every normalized conversation message.
 * @param {VeniceToolRequest["messages"]} messages - Text messages with tool data already folded into content.
 * @param {Uint8Array} modelPublicKey - Independently verified enclave key.
 * @returns {VeniceToolRequest["messages"]} Encrypted messages with at most one system envelope.
 */
export function encryptVeniceMessages(
  messages: VeniceToolRequest["messages"],
  modelPublicKey: Uint8Array,
): VeniceToolRequest["messages"] {
  for (const message of messages) {
    if (
      !["system", "user", "assistant"].includes(message.role) ||
      typeof message.content !== "string" ||
      Object.keys(message).some(
        (field) => field !== "role" && field !== "content",
      )
    ) {
      throw privacyError("PRIVACY_UNSUPPORTED_FEATURE");
    }
  }
  const systemMessages = messages.filter(
    (message) => message.role === "system",
  );
  let emittedSystem = false;
  return messages.flatMap((message) => {
    if (message.role === "system" && emittedSystem) {
      return [];
    }
    // Upstream system-message joining must not insert plaintext separators into ciphertext.
    const content =
      message.role === "system"
        ? systemMessages.map((system) => system.content).join("\n\n")
        : (message.content as string);
    if (message.role === "system") {
      emittedSystem = true;
    }
    return [
      {
        role: message.role,
        content: encryptVeniceMessage(content, modelPublicKey),
      },
    ];
  });
}

/** Generate an independently owned secp256k1 key pair for one protected request.
 * @returns {{privateKey: Uint8Array, publicKey: Uint8Array}} Owned request key pair.
 */
export function generateVeniceKeyPair(): {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
} {
  const privateKey = secp256k1.utils.randomSecretKey();
  return { privateKey, publicKey: secp256k1.getPublicKey(privateKey, false) };
}

/** Encrypt one UTF-8 message using Venice's ephemeral ECDH/HKDF/AES-GCM format.
 * @param {string} text - Local plaintext.
 * @param {Uint8Array} modelPublicKey - Verified uncompressed enclave key.
 * @returns {string} Lowercase hexadecimal authenticated envelope.
 */
export function encryptVeniceMessage(
  text: string,
  modelPublicKey: Uint8Array,
): string {
  let privateKey: Uint8Array | undefined;
  let sharedPoint: Uint8Array | undefined;
  let aesKey: Buffer | undefined;
  const plaintext = Buffer.from(text, "utf8");
  try {
    if (modelPublicKey.length !== PUBLIC_KEY_BYTES || modelPublicKey[0] !== 4) {
      throw privacyError("PRIVACY_INVALID_RESPONSE");
    }
    privateKey = secp256k1.utils.randomSecretKey();
    const publicKey = secp256k1.getPublicKey(privateKey, false);
    sharedPoint = secp256k1.getSharedSecret(privateKey, modelPublicKey, false);
    aesKey = Buffer.from(
      hkdfSync(
        "sha256",
        sharedPoint.subarray(1, 33),
        Buffer.alloc(0),
        HKDF_INFO,
        32,
      ),
    );
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv("aes-256-gcm", aesKey, nonce);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);
    return Buffer.concat([
      publicKey,
      nonce,
      ciphertext,
      cipher.getAuthTag(),
    ]).toString("hex");
  } catch {
    throw privacyError("PRIVACY_INVALID_RESPONSE");
  } finally {
    privateKey?.fill(0);
    sharedPoint?.fill(0);
    aesKey?.fill(0);
    plaintext.fill(0);
  }
}

/** Decrypt an authenticated Venice content chunk; plaintext fallback is never accepted.
 * @param {string} ciphertextHex - Complete encrypted envelope.
 * @param {Uint8Array} privateKey - Owning request's private key.
 * @returns {string} Authenticated UTF-8 content.
 */
export function decryptVeniceChunk(
  ciphertextHex: string,
  privateKey: Uint8Array,
): string {
  let sharedPoint: Uint8Array | undefined;
  let aesKey: Buffer | undefined;
  let plaintext: Buffer | undefined;
  let decryptedPart: Buffer | undefined;
  let finalPart: Buffer | undefined;
  try {
    if (
      ciphertextHex.length < (PUBLIC_KEY_BYTES + NONCE_BYTES + TAG_BYTES) * 2 ||
      ciphertextHex.length % 2 !== 0 ||
      !/^[0-9a-f]+$/.test(ciphertextHex)
    ) {
      throw privacyError("PRIVACY_RESPONSE_AUTHENTICATION_FAILED");
    }
    const payload = Buffer.from(ciphertextHex, "hex");
    const publicKey = payload.subarray(0, PUBLIC_KEY_BYTES);
    if (publicKey[0] !== 4) {
      throw privacyError("PRIVACY_RESPONSE_AUTHENTICATION_FAILED");
    }
    sharedPoint = secp256k1.getSharedSecret(privateKey, publicKey, false);
    aesKey = Buffer.from(
      hkdfSync(
        "sha256",
        sharedPoint.subarray(1, 33),
        Buffer.alloc(0),
        HKDF_INFO,
        32,
      ),
    );
    const nonce = payload.subarray(
      PUBLIC_KEY_BYTES,
      PUBLIC_KEY_BYTES + NONCE_BYTES,
    );
    const decipher = createDecipheriv("aes-256-gcm", aesKey, nonce);
    decipher.setAuthTag(payload.subarray(payload.length - TAG_BYTES));
    decryptedPart = decipher.update(
      payload.subarray(
        PUBLIC_KEY_BYTES + NONCE_BYTES,
        payload.length - TAG_BYTES,
      ),
    );
    finalPart = decipher.final();
    plaintext = Buffer.concat([decryptedPart, finalPart]);
    return new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
  } catch {
    throw privacyError("PRIVACY_RESPONSE_AUTHENTICATION_FAILED");
  } finally {
    sharedPoint?.fill(0);
    aesKey?.fill(0);
    decryptedPart?.fill(0);
    finalPart?.fill(0);
    plaintext?.fill(0);
  }
}

/** Verify an EIP-191 signature against the attested public key and exact UTF-8 text.
 * @param {string} signedText - Exact signed content or independently reconstructed digest text.
 * @param {string} signatureHex - Ethereum recoverable signature.
 * @param {Uint8Array} signingPublicKey - Verified uncompressed enclave key.
 * @returns {boolean} Whether signer, recovery bit, and signature match.
 */
export function verifyVeniceSignature(
  signedText: string,
  signatureHex: string,
  signingPublicKey: Uint8Array,
): boolean {
  try {
    const encodedSignature = signatureHex.startsWith("0x")
      ? signatureHex.slice(2)
      : signatureHex;
    if (
      !/^[0-9a-fA-F]{130}$/.test(encodedSignature) ||
      signingPublicKey.length !== PUBLIC_KEY_BYTES ||
      signingPublicKey[0] !== 4
    ) {
      return false;
    }
    const signatureBytes = Buffer.from(encodedSignature, "hex");
    const encodedRecovery = signatureBytes[64]!;
    const recovery =
      encodedRecovery >= 27 ? encodedRecovery - 27 : encodedRecovery;
    if (recovery !== 0 && recovery !== 1) {
      return false;
    }
    const content = Buffer.from(signedText, "utf8");
    const prefix = Buffer.from(
      `\x19Ethereum Signed Message:\n${content.length}`,
      "utf8",
    );
    const messageHash = keccak_256(Buffer.concat([prefix, content]));
    const compactSignature = signatureBytes.subarray(0, 64);
    if (
      !secp256k1.verify(compactSignature, messageHash, signingPublicKey, {
        prehash: false,
        lowS: false,
      })
    ) {
      return false;
    }
    const recoveredKey = secp256k1.Signature.fromBytes(compactSignature)
      .addRecoveryBit(recovery)
      .recoverPublicKey(messageHash)
      .toBytes(false);
    return timingSafeEqual(recoveredKey, signingPublicKey);
  } catch {
    return false;
  }
}

/** Derive the Ethereum address bound into Venice's TDX report data.
 * @param {Uint8Array} publicKey - Verified uncompressed secp256k1 key.
 * @returns {Uint8Array} Twenty-byte Ethereum address.
 */
export function deriveVeniceAddress(publicKey: Uint8Array): Uint8Array {
  try {
    if (
      publicKey.length !== PUBLIC_KEY_BYTES ||
      publicKey[0] !== 4 ||
      !secp256k1.utils.isValidPublicKey(publicKey, false)
    ) {
      throw privacyError("PRIVACY_INVALID_RESPONSE");
    }
    return keccak_256(publicKey.subarray(1)).slice(-20);
  } catch {
    throw privacyError("PRIVACY_INVALID_RESPONSE");
  }
}
