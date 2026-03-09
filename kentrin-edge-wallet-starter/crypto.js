import * as bip39 from "bip39";
import nacl from "tweetnacl";

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

function concatBytes(...arrays) {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    out.set(arr, offset);
    offset += arr.length;
  }
  return out;
}

async function sha256Bytes(input) {
  const hash = await crypto.subtle.digest("SHA-256", input);
  return new Uint8Array(hash);
}

function normalizeRecoveryPhrase(phrase) {
  return phrase.trim().toLowerCase().replace(/\s+/g, " ");
}

// ASN.1 DER prefix for Ed25519 SubjectPublicKeyInfo:
// 302a300506032b6570032100 || 32-byte raw public key
function spkiFromRawPublicKey(publicKeyBytes) {
  const prefix = Uint8Array.from([
    0x30, 0x2a,
    0x30, 0x05,
    0x06, 0x03, 0x2b, 0x65, 0x70,
    0x03, 0x21, 0x00
  ]);
  return concatBytes(prefix, publicKeyBytes);
}

// ASN.1 DER prefix for Ed25519 PKCS#8 private key seed:
// 302e020100300506032b657004220420 || 32-byte seed
function pkcs8FromRawPrivateSeed(privateSeedBytes) {
  const prefix = Uint8Array.from([
    0x30, 0x2e,
    0x02, 0x01, 0x00,
    0x30, 0x05,
    0x06, 0x03, 0x2b, 0x65, 0x70,
    0x04, 0x22, 0x04, 0x20
  ]);
  return concatBytes(prefix, privateSeedBytes);
}

function rawPrivateSeedFromPkcs8(pkcs8Bytes) {
  const prefixLength = 16;
  if (!(pkcs8Bytes instanceof Uint8Array)) {
    throw new Error("PKCS8 input must be Uint8Array.");
  }
  if (pkcs8Bytes.length !== prefixLength + 32) {
    throw new Error("Invalid Ed25519 PKCS8 private key length.");
  }
  return pkcs8Bytes.slice(prefixLength);
}

export function generateRecoveryPhrase() {
  return bip39.generateMnemonic(128);
}

export function validateRecoveryPhrase(phrase) {
  return bip39.validateMnemonic(normalizeRecoveryPhrase(phrase));
}

export async function deriveDeterministicSeedFromPhrase(phrase) {
  const normalized = normalizeRecoveryPhrase(phrase);
  if (!validateRecoveryPhrase(normalized)) {
    throw new Error("Invalid recovery phrase.");
  }

  const bip39Seed = await bip39.mnemonicToSeed(normalized);
  return bytesToBase64(new Uint8Array(bip39Seed));
}

export async function deriveWalletFromMnemonic(phrase) {
  const normalized = normalizeRecoveryPhrase(phrase);

  if (!validateRecoveryPhrase(normalized)) {
    throw new Error("Invalid recovery phrase.");
  }

  const bip39Seed = new Uint8Array(await bip39.mnemonicToSeed(normalized));

  // Versioned deterministic derivation rule for Kentrin single-account wallet:
  // SHA-256("KENTRIN|WALLET|v1|" + bip39Seed)
  const domain = new TextEncoder().encode("KENTRIN|WALLET|v1|");
  const privateSeed = await sha256Bytes(concatBytes(domain, bip39Seed));

  const keyPair = nacl.sign.keyPair.fromSeed(privateSeed);
  const publicKeyRaw = new Uint8Array(keyPair.publicKey);

  const publicKeySpki = spkiFromRawPublicKey(publicKeyRaw);
  const publicKeySpkiBase64 = bytesToBase64(publicKeySpki);

  const privateKeyPkcs8 = pkcs8FromRawPrivateSeed(privateSeed);
  const privateKeyPkcs8Base64 = bytesToBase64(privateKeyPkcs8);

  const publicKeyPem = await exportPublicKeyPem(publicKeyRaw);
  const address = await deriveAddressFromPublicKey(publicKeyRaw);

  return {
    address,
    publicKeyPem,
    publicKeySpkiBase64,
    privateKeyPkcs8Base64,
    recoverySeed: bytesToBase64(bip39Seed),
    kentrinSeedBase64: bytesToBase64(privateSeed)
  };
}

export async function deriveAddressFromPublicKey(publicKeyRawBytes) {
  const spki = spkiFromRawPublicKey(publicKeyRawBytes);
  const digest = await sha256Bytes(spki);
  return "KU1" + bytesToHex(digest).slice(0, 40);
}

export async function exportPublicKeyPem(publicKeyRawBytes) {
  const spki = spkiFromRawPublicKey(publicKeyRawBytes);
  const base64 = bytesToBase64(spki).match(/.{1,64}/g)?.join("\n") || "";
  return `-----BEGIN PUBLIC KEY-----\n${base64}\n-----END PUBLIC KEY-----`;
}

export async function exportPrivateKeyPkcs8Base64(privateSeedBytes) {
  const pkcs8 = pkcs8FromRawPrivateSeed(privateSeedBytes);
  return bytesToBase64(pkcs8);
}

async function deriveAesKey(password, saltBytes) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: 250000,
      hash: "SHA-256"
    },
    baseKey,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptJsonWithPassword(payload, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(password, salt);

  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext
  ));

  return {
    version: 1,
    salt_b64: bytesToBase64(salt),
    iv_b64: bytesToBase64(iv),
    ciphertext_b64: bytesToBase64(ciphertext)
  };
}

export async function decryptJsonWithPassword(blob, password) {
  const salt = base64ToBytes(blob.salt_b64);
  const iv = base64ToBytes(blob.iv_b64);
  const key = await deriveAesKey(password, salt);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    base64ToBytes(blob.ciphertext_b64)
  );

  return JSON.parse(new TextDecoder().decode(plaintext));
}

export async function signCanonicalMessage(privateKeyPkcs8Base64, message) {
  const pkcs8Bytes = base64ToBytes(privateKeyPkcs8Base64);
  const privateSeed = rawPrivateSeedFromPkcs8(pkcs8Bytes);
  const keyPair = nacl.sign.keyPair.fromSeed(privateSeed);

  const signature = nacl.sign.detached(
    new TextEncoder().encode(message),
    keyPair.secretKey
  );

  return bytesToBase64(signature);
}