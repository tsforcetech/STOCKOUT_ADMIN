import * as React from "react";
import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

/** Debounced search box; emits only after typing pauses. */
export function SearchInput({ value, onChange, placeholder = "Search…", label = "Search" }: { value: string; onChange: (value: string) => void; placeholder?: string; label?: string }) {
  const [draft, setDraft] = React.useState(value);
  const debounced = useDebouncedValue(draft, 350);

  React.useEffect(() => {
    setDraft(value);
  }, [value]);
  React.useEffect(() => {
    if (debounced !== value) onChange(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <div className="relative w-full sm:w-[340px]">
      <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-foreground" aria-hidden />
      <Input type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} aria-label={label} className="border-transparent bg-surface-muted pl-10 pr-8 hover:border-border" />
      {draft && (
        <button type="button" onClick={() => setDraft("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Clear search">
          <XIcon className="size-4" />
        </button>
      )}
    </div>
  );
}
