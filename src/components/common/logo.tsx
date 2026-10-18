import { brandLogoUrl } from "@/assets/brand";
import { cn } from "@/lib/utils/cn";

/**
 * StockOut wordmark. The Figma logo (node 653:28631) is a raster asset: export it to
 * src/assets/brand/stockout-logo.png (see docs/FIGMA_IMPLEMENTATION.md). Until that file exists the
 * component renders a text wordmark in the heading font so the layout stays intact.
 */
/** The lime "O" from the StockOut wordmark: a rounded-square ring. */
function LogoO({ light }: { light?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="mx-[0.02em] inline-block h-[0.82em] w-[0.82em] align-[-0.06em]" aria-hidden>
      <rect x="2.5" y="2.5" width="15" height="15" rx="3.5" fill="none" strokeWidth="4.2" className={light ? "stroke-[#f8ff2c]" : "stroke-action-border dark:stroke-action"} />
    </svg>
  );
}

export function Logo({ className, compact = false, tone = "default" }: { className?: string; compact?: boolean; tone?: "default" | "light" }) {
  if (brandLogoUrl) {
    return <img src={brandLogoUrl} alt="StockOut" className={cn(compact ? "h-6" : "h-[22px]", "w-auto select-none", className)} draggable={false} />;
  }
  return (
    <span
      className={cn("inline-flex select-none items-baseline font-heading font-bold tracking-tight", tone === "light" ? "text-white" : "text-foreground", compact ? "text-lg" : "text-xl", className)}
      role="img"
      aria-label="StockOut"
    >
      {compact ? (
        <>
          S<LogoO light={tone === "light"} />
        </>
      ) : (
        <>
          Stock
          <LogoO light={tone === "light"} />
          ut
        </>
      )}
    </span>
  );
}
