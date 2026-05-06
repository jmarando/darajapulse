import { Instagram, Youtube, Twitter, Facebook, Music2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type Platform = "tiktok" | "instagram" | "youtube" | "twitter" | "facebook";

const PLATFORMS: { value: Platform; label: string; Icon: any; brand: string }[] = [
  { value: "tiktok",    label: "TikTok",    Icon: Music2,    brand: "bg-foreground text-background" },
  { value: "instagram", label: "Instagram", Icon: Instagram, brand: "bg-gradient-to-br from-[hsl(330,80%,55%)] via-[hsl(20,90%,55%)] to-[hsl(45,95%,55%)] text-white" },
  { value: "youtube",   label: "YouTube",   Icon: Youtube,   brand: "bg-[hsl(0,85%,50%)] text-white" },
  { value: "twitter",   label: "X",         Icon: Twitter,   brand: "bg-foreground text-background" },
  { value: "facebook",  label: "Facebook",  Icon: Facebook,  brand: "bg-[hsl(220,85%,50%)] text-white" },
];

interface Props {
  value: Platform | string;
  onChange: (v: Platform) => void;
  className?: string;
}

export const PlatformPicker = ({ value, onChange, className }: Props) => {
  return (
    <div className={cn("grid grid-cols-5 gap-2", className)} role="radiogroup" aria-label="Platform">
      {PLATFORMS.map(({ value: v, label, Icon, brand }) => {
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(v)}
            className={cn(
              "group flex flex-col items-center gap-1.5 rounded-lg border p-2.5 transition-all",
              "hover:border-primary/50 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "border-primary bg-accent shadow-sm" : "border-border bg-background",
            )}
          >
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md transition-transform",
                active ? brand + " scale-100" : "bg-muted text-muted-foreground group-hover:scale-105",
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={2} />
            </span>
            <span className={cn("text-[11px] font-medium", active ? "text-foreground" : "text-muted-foreground")}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
};
