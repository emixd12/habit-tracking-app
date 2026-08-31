import { digest } from "ohash/crypto";

const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function sha256(value: string): string {
  // Node replaces unpaired UTF-16 surrogates while encoding UTF-8. Preserve that contract.
  const encoded = digest(value.toWellFormed());
  let bits = 0;
  let buffer = 0;
  let hex = "";
  for (const character of encoded) {
    buffer = (buffer << 6) | BASE64URL.indexOf(character);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      hex += ((buffer >> bits) & 255).toString(16).padStart(2, "0");
    }
  }
  return hex;
}
