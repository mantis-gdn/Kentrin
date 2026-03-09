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

async function sha256Bytes(input) {
  const hash = await crypto.subtle.digest("SHA-256", input);
  return new Uint8Array(hash);
}

export async function deriveAddressFromPublicKey(publicKey) {
  const spki = await crypto.subtle.exportKey("spki", publicKey);
  const digest = await sha256Bytes(spki);
  return "KU1" + bytesToHex(digest).slice(0, 40);
}

export async function exportPublicKeyPem(publicKey) {
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", publicKey));
  const base64 = bytesToBase64(spki).match(/.{1,64}/g)?.join("\n") || "";
  return `-----BEGIN PUBLIC KEY-----\n${base64}\n-----END PUBLIC KEY-----`;
}

export async function exportPrivateKeyPkcs8Base64(privateKey) {
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", privateKey));
  return bytesToBase64(pkcs8);
}

export async function importPrivateKeyPkcs8Base64(pkcs8Base64) {
  return crypto.subtle.importKey(
    "pkcs8",
    base64ToBytes(pkcs8Base64),
    { name: "Ed25519" },
    true,
    ["sign"]
  );
}

export async function importPublicKeySpkiBase64(spkiBase64) {
  return crypto.subtle.importKey(
    "spki",
    base64ToBytes(spkiBase64),
    { name: "Ed25519" },
    true,
    ["verify"]
  );
}

export async function exportPublicKeySpkiBase64(publicKey) {
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", publicKey));
  return bytesToBase64(spki);
}

export async function generateWalletMaterial() {
  const keypair = await crypto.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"]
  );

  const publicKeySpkiBase64 = await exportPublicKeySpkiBase64(keypair.publicKey);
  const privateKeyPkcs8Base64 = await exportPrivateKeyPkcs8Base64(keypair.privateKey);
  const address = await deriveAddressFromPublicKey(keypair.publicKey);
  const publicKeyPem = await exportPublicKeyPem(keypair.publicKey);

  return {
    address,
    publicKeyPem,
    publicKeySpkiBase64,
    privateKeyPkcs8Base64
  };
}

export function generateRecoveryPhrase() {
  const wordList = [
    "anchor","apple","ash","atom","barrel","basic","beacon","blade","brass","bridge","cable","candle",
    "canyon","carbon","cedar","cipher","cobalt","comet","copper","crystal","delta","ember","falcon",
    "fiber","forge","frost","gamma","glow","granite","harbor","helix","hollow","ion","jade","keystone",
    "kinetic","lantern","lattice","ledger","linen","matrix","mercury","midnight","nova","oak","onyx",
    "orbit","pearl","phoenix","prism","pulse","quartz","radar","raven","reef","relay","ripple","signal",
    "silver","slate","solar","static","stone","summit","tensor","thunder","timber","torch","vector",
    "violet","wave","willow","wire","zenith"
  ];

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const words = [];
  for (let i = 0; i < 12; i += 1) {
    words.push(wordList[bytes[i] % wordList.length]);
  }
  return words.join(" ");
}

export async function deriveDeterministicSeedFromPhrase(phrase) {
  const data = new TextEncoder().encode(phrase.trim().toLowerCase());
  const digest = await sha256Bytes(data);
  return bytesToBase64(digest);
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
  const privateKey = await importPrivateKeyPkcs8Base64(privateKeyPkcs8Base64);
  const sig = await crypto.subtle.sign(
    { name: "Ed25519" },
    privateKey,
    new TextEncoder().encode(message)
  );
  return bytesToBase64(new Uint8Array(sig));
}
