import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";

export type ComboboxItem = { id: string; label: string };

type Props = {
  value: string;
  onChange: (v: string) => void;
  items: ComboboxItem[];
  /** Label shown when nothing is selected — doubles as the "all" option. */
  placeholder: string;
  allValue: string;
  className?: string;
  ariaLabel?: string;
};

/** Searchable, keyboard-navigable single-select built on the app's Command + Popover. */
export const Combobox = ({
  value, onChange, items, placeholder, allValue, className, ariaLabel,
}: Props) => {
  const [open, setOpen] = React.useState(false);
  const selected = value === allValue ? null : items.find((i) => i.id === value);
  const active = value !== allValue;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel || placeholder}
          className={cn(
            "h-9 w-full md:w-[190px] justify-between font-normal",
            active && "border-accent/60 text-foreground",
            !active && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <span className="flex items-center gap-1 shrink-0">
            {active && (
              <span
                role="button"
                tabIndex={-1}
                aria-label={`Clear ${placeholder}`}
                onClick={(e) => { e.stopPropagation(); onChange(allValue); }}
                className="rounded-sm p-0.5 hover:bg-muted"
              >
                <X className="w-3 h-3" />
              </span>
            )}
            <ChevronsUpDown className="w-3.5 h-3.5 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <Command>
          <CommandInput placeholder={`Search ${placeholder.replace(/^All /, "")}…`} />
          <CommandList className="max-h-64">
            <CommandEmpty>No matching results</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={placeholder}
                onSelect={() => { onChange(allValue); setOpen(false); }}
              >
                <Check className={cn("mr-2 h-4 w-4", value === allValue ? "opacity-100" : "opacity-0")} />
                {placeholder}
              </CommandItem>
              {items.map((i) => (
                <CommandItem
                  key={i.id}
                  value={`${i.label} ${i.id}`}
                  onSelect={() => { onChange(i.id); setOpen(false); }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === i.id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{i.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default Combobox;
