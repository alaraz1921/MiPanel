const encoder = new TextEncoder();
const decoder = new TextDecoder();

function decodeBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64(value: Uint8Array) {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function encryptionKey() {
  const encodedKey = Deno.env.get('MICROSOFT_TOKEN_ENCRYPTION_KEY');
  if (!encodedKey) throw new Error('Falta la clave de cifrado de credenciales.');
  const bytes = decodeBase64(encodedKey);
  if (bytes.byteLength !== 32) throw new Error('La clave de cifrado debe tener 32 bytes en Base64.');
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptCredential(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(), encoder.encode(value));
  return `${encodeBase64(iv)}.${encodeBase64(new Uint8Array(encrypted))}`;
}

export async function decryptCredential(value: string) {
  const [encodedIv, encodedPayload, ...remaining] = value.split('.');
  if (!encodedIv || !encodedPayload || remaining.length) throw new Error('Credencial cifrada no válida.');
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decodeBase64(encodedIv) },
    await encryptionKey(),
    decodeBase64(encodedPayload),
  );
  return decoder.decode(plaintext);
}
