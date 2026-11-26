// Removes personal data before a message leaves for ml-api or is stored. Heuristic: it catches the account's own
// names and addresses plus recognisable patterns, not every possible third-party name.

export interface KnownPii {
  names: string[];
  addresses: string[];
}

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/gu;
const ORDER_CODE = /\bORD[-\s]?\d{6}[-\s]?[A-Z0-9]{4}\b/gi;
// Eight digits or more, however they are spaced: phone, account and identity numbers.
const LONG_NUMBER = /\+?\d(?:[\s.-]?\d){7,}/g;
const STATED_NAME = /\b(nama\s+(?:saya|aku|gue|gua)(?:\s+adalah)?|atas\s+nama|a\/n)\s+\p{L}+(?:\s+\p{L}+)?/giu;
// "jl"/"jln"/"gg" only ever mean an address.
const STREET_SHORT = /\b(?:jln?|gg)\b\.?\s*[^,?!\n]+/gi;
// "jalan", "blok" and friends are everyday words too, so they need a number nearby.
const STREET_LONG = /\b(?:jalan|gang|komplek|kompleks|perumahan|perum|blok)\b\.?\s+[^,?!\n]{0,40}?\d+[a-z]?/gi;
const RT_RW = /\br[tw]\b\.?\s*\d{1,3}(?:\s*\/?\s*(?:rw\b\.?\s*)?\d{1,3})?/gi;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function replaceWords(text: string, values: string[], token: string): string {
  // Longest first, so a full name wins over its parts.
  const sorted = [...new Set(values.map((v) => v.trim()).filter((v) => v.length >= 3))].sort(
    (a, b) => b.length - a.length,
  );
  return sorted.reduce(
    (out, v) => out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escape(v)}(?![\\p{L}\\p{N}])`, "giu"), token),
    text,
  );
}

export function maskPii(text: string, known: KnownPii = { names: [], addresses: [] }): string {
  let out = text.replace(EMAIL, "[email]").replace(ORDER_CODE, "[kode_pesanan]");
  out = replaceWords(out, known.addresses, "[alamat]");
  out = replaceWords(out, [...known.names, ...known.names.flatMap((n) => n.split(/\s+/))], "[nama]");
  return out
    .replace(LONG_NUMBER, "[nomor]")
    .replace(STATED_NAME, "$1 [nama]")
    .replace(STREET_SHORT, "[alamat]")
    .replace(STREET_LONG, "[alamat]")
    .replace(RT_RW, "[alamat]");
}
