import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { LogOut, MoreHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** The Daraja Pulse pulse line in a small brand square, or the workspace's own logo. */
export function BrandMark({ name, logoUrl, caption }: { name: string; logoUrl?: string | null; caption?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {logoUrl ? (
        <img src={logoUrl} alt="" data-no-outline className="h-8 w-8 shrink-0 rounded-[9px] bg-white object-contain p-0.5" />
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-accent text-white shadow-[inset_0_-1px_0_hsl(0_0%_0%/0.15)]" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M1.5 11h4l1.6-3.2 2.4 7.4L12.4 3l2.1 8h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[16px] font-medium tracking-[-0.01em]">{name}</div>
        {caption && <div className="truncate text-[11.5px] text-muted-foreground">{caption}</div>}
      </div>
    </div>
  );
}

export function NavGroupLabel({ children }: { children: ReactNode }) {
  return <div className="px-3 pb-1.5 pt-5 text-[12px] text-muted-foreground">{children}</div>;
}

/** A sidebar link. The current page is a dark pill; counts sit in a brand-colour badge. */
export function NavItem({ to, end, icon: Icon, label, count, onNavigate }: {
  to: string;
  end?: boolean;
  icon: LucideIcon;
  label: string;
  count?: number;
  onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-[10px] px-3 py-2 text-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isActive
            ? "bg-primary font-medium text-primary-foreground shadow-[0_1px_2px_hsl(240_6%_10%/0.2),0_6px_14px_-8px_hsl(240_6%_10%/0.45)]"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground",
        )
      }
    >
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count != null && count > 0 && (
        <span className="min-w-[20px] rounded-full bg-accent px-1.5 text-center text-[11px] font-semibold leading-5 tabular-nums text-white">
          {count > 99 ? "99+" : count}
          <span className="sr-only"> waiting</span>
        </span>
      )}
    </NavLink>
  );
}

/** Who is signed in, with the account menu. */
export function UserCard({ name, detail, email, onSignOut, menu }: {
  name: string;
  detail?: string;
  email?: string | null;
  onSignOut: () => void;
  /** Extra menu entries above "Sign out". */
  menu?: ReactNode;
}) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
  return (
    <div className="flex items-center gap-2.5 rounded-[12px] px-2 py-2">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-raised text-[13px] font-semibold text-foreground ring-1 ring-border" aria-hidden>
        {initials}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[13.5px] font-medium">{name}</div>
        {detail && <div className="truncate text-[12px] text-muted-foreground">{detail}</div>}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger className="rounded-full p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Account menu">
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="w-56">
          {email && <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{email}</DropdownMenuLabel>}
          {menu}
          {(email || menu) && <DropdownMenuSeparator />}
          <DropdownMenuItem onSelect={onSignOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
