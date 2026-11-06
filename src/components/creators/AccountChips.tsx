import { AtSign, Facebook, Ghost, Instagram, Linkedin, Music2, Twitter, Youtube } from "lucide-react";
import { platformName, profileUrl, type CreatorAccount } from "@/lib/creatorAccounts";
import { compact } from "@/lib/reportInsights";

const ICONS: Record<string, typeof Music2> = {
  tiktok: Music2,
  instagram: Instagram,
  facebook: Facebook,
  twitter: Twitter,
  youtube: Youtube,
  linkedin: Linkedin,
  threads: AtSign,
  snapchat: Ghost,
};

export const PlatformIcon = ({ platform, className }: { platform: string; className?: string }) => {
  const Icon = ICONS[platform] ?? AtSign;
  return <Icon className={className} />;
};

/** One account: its platform, handle and followers. A name typed in place of a handle shows as typed, and doesn't link. */
export function AccountChip({ account }: { account: CreatorAccount }) {
  const url = account.readable ? profileUrl(account.platform, account.handle) : null;
  const label = account.readable ? `@${account.handle}` : account.handle;
  const body = (
    <>
      <PlatformIcon platform={account.platform} className="h-3 w-3 shrink-0 text-foreground/70" />
      <span className="max-w-[110px] truncate">{label}</span>
      {account.followers != null && <span className="tabular-nums text-muted-foreground">{compact(account.followers)}</span>}
    </>
  );
  const className = "inline-flex max-w-full items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-[11px]";
  const title = `${platformName(account.platform)}: ${label}`;
  if (!url) return <span className={className} title={`${title}. A name, so we can't read this account's numbers.`}>{body}</span>;
  return <a className={`${className} hover:bg-secondary/70`} href={url} target="_blank" rel="noreferrer" title={title}>{body}</a>;
}

/** A creator's accounts, main first, with the rest counted when there isn't room. */
export function AccountChips({ accounts, max = 4 }: { accounts: CreatorAccount[]; max?: number }) {
  if (!accounts.length) return <span className="text-[11px] text-muted-foreground">No handle yet</span>;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {accounts.slice(0, max).map((a) => <AccountChip key={`${a.platform}:${a.handle}`} account={a} />)}
      {accounts.length > max && <span className="text-[11px] text-muted-foreground">+{accounts.length - max}</span>}
    </div>
  );
}
