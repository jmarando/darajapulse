import { parseAccount } from "@/lib/creatorAccounts";

export type ListedAccount = { platform: string; handle: string; readable: boolean; followers: number | null };
export type ListedCreator = {
  line: string;
  name: string | null;
  accounts: ListedAccount[];
  email: string | null;
  phone: string | null;
  /** A link on this line that couldn't be read, in plain words. The rest of the line still counts. */
  problem: string | null;
};

const PLATFORM_WORDS: Record<string, string> = {
  tiktok: "tiktok", tt: "tiktok",
  instagram: "instagram", ig: "instagram", insta: "instagram",
  facebook: "facebook", fb: "facebook",
  twitter: "twitter", x: "twitter",
  youtube: "youtube", yt: "youtube",
  linkedin: "linkedin",
  threads: "threads",
  snapchat: "snapchat", snap: "snapchat",
};

const LINK = /(?:https?:\/\/|www\.)[^\s,;|]+|\b(?:[a-z0-9-]+\.)*(?:tiktok|instagram|facebook|fb|x|twitter|youtube|youtu|linkedin|threads|snapchat)\.(?:com|net|be)\/[^\s,;|]+/gi;
const EMAIL = /[^\s,;|<>()]+@[^\s,;|<>()]+\.[a-z]{2,}/i;
const PHONE = /(^|[\s,;|])\+?\d[\d\s-]{7,}\d(?=$|[\s,;|])/;
const AT_HANDLE = /(^|[\s,;|(])@([a-z0-9._-]+)/gi;
const PREFIXED = new RegExp(`(^|[\\s,;|(])(${Object.keys(PLATFORM_WORDS).join("|")})\\s*[:=]\\s*@?([a-z0-9._-]+)`, "gi");
const CELL_BREAK = /[\t,;|]+|\s+[-–—]\s+|\s{2,}/;

const digits = (text: string) => text.replace(/\D/g, "");

/** "12K", "1.2M" or "12,000" as a number. */
function readCount(text: string): number | null {
  const m = text.trim().replace(/,/g, "").match(/^(\d+(?:\.\d+)?)\s*([km])?$/i);
  if (!m) return null;
  const scale = m[2]?.toLowerCase() === "m" ? 1_000_000 : m[2]?.toLowerCase() === "k" ? 1_000 : 1;
  return Math.round(Number(m[1]) * scale);
}

type Column = { kind: "name" | "email" | "phone" } | { kind: "handle" | "followers"; platform: string } | null;

function readHeading(cell: string): Column {
  const lower = cell.toLowerCase();
  const platform = lower.split(/[^a-z0-9]+/).map((w) => PLATFORM_WORDS[w]).find(Boolean);
  if (/follow/.test(lower)) return platform ? { kind: "followers", platform } : null;
  if (platform) return { kind: "handle", platform };
  if (/e-?mail/.test(lower)) return { kind: "email" };
  if (/phone|mobile|whatsapp|m-?pesa|msisdn|\btel\b/.test(lower)) return { kind: "phone" };
  if (/name|creator|influencer/.test(lower)) return { kind: "name" };
  return null;
}

/** The columns of a pasted sheet's first row, or null when that row is already a creator. */
function readHeadings(line: string, separator: string): Column[] | null {
  if (/[@:\d]/.test(line)) return null;
  const cells = line.split(separator);
  if (cells.length < 2) return null;
  const columns = cells.map(readHeading);
  const recognised = columns.filter(Boolean);
  const namesAPlatform = recognised.some((c) => c && "platform" in c);
  return namesAPlatform || recognised.length >= 2 ? columns : null;
}

const newCreator = (line: string): ListedCreator => ({ line, name: null, accounts: [], email: null, phone: null, problem: null });

function addAccount(creator: ListedCreator, text: string, fallback?: string) {
  const parsed = parseAccount(text, fallback);
  if ("error" in parsed) {
    creator.problem ??= parsed.error;
    return;
  }
  creator.accounts.push({ ...parsed, followers: null });
}

function readRow(line: string, columns: Column[], separator: string): ListedCreator {
  const creator = newCreator(line);
  const cells = line.split(separator).map((c) => c.trim());
  columns.forEach((column, i) => {
    const cell = cells[i] ?? "";
    if (!column || !cell) return;
    if (column.kind === "name") creator.name = cell;
    if (column.kind === "email") creator.email = cell.toLowerCase();
    if (column.kind === "phone") creator.phone = digits(cell);
    if (column.kind === "handle") addAccount(creator, cell, column.platform);
  });
  columns.forEach((column, i) => {
    if (column?.kind !== "followers") return;
    const account = creator.accounts.find((a) => a.platform === column.platform);
    if (account) account.followers = readCount(cells[i] ?? "");
  });
  return creator;
}

function readFreeLine(line: string, fallback: string): ListedCreator {
  const creator = newCreator(line);
  let rest = line;
  rest = rest.replace(LINK, (link) => {
    addAccount(creator, link);
    return " ";
  });
  rest = rest.replace(EMAIL, (email) => {
    creator.email = email.toLowerCase();
    return " ";
  });
  rest = rest.replace(PHONE, (phone, before: string) => {
    creator.phone = digits(phone);
    return before;
  });
  rest = rest.replace(PREFIXED, (_all, before: string, word: string, handle: string) => {
    addAccount(creator, handle, PLATFORM_WORDS[word.toLowerCase()]);
    return before;
  });
  rest = rest.replace(AT_HANDLE, (_all, before: string, handle: string) => {
    addAccount(creator, handle, fallback);
    return before;
  });

  const cells = rest.split(CELL_BREAK).map((c) => c.replace(/^[\s\-–—:•*]+|[\s\-–—:•*]+$/g, "")).filter(Boolean);
  const plainHandles: string[] = [];
  for (const cell of cells) {
    const hasSpace = /\s/.test(cell);
    if (!creator.name && (hasSpace || creator.accounts.length > 0 || cells.length > 1)) creator.name = cell;
    else if (!hasSpace) plainHandles.push(cell);
  }
  for (const handle of plainHandles) {
    const parsed = parseAccount(handle, fallback);
    if ("error" in parsed || !parsed.readable) creator.name ??= handle;
    else addAccount(creator, handle, fallback);
  }
  return creator;
}

/**
 * Reads a pasted list, one creator per line, however it was written: links, @handles, names, a mix, or rows from a sheet
 * with a heading row. `fallback` is the platform a bare handle is on.
 */
export function parseCreatorList(text: string, fallback: string): ListedCreator[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  const separator = lines[0].includes("\t") ? "\t" : ",";
  const columns = readHeadings(lines[0], separator);
  if (columns) return lines.slice(1).map((l) => readRow(l, columns, separator)).filter((c) => c.name || c.accounts.length || c.email);
  return lines.map((l) => readFreeLine(l.trim(), fallback));
}
