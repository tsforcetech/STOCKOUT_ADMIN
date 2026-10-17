import { brandLogoUrl } from "@/assets/brand";
import { cn } from "@/lib/utils/cn";

/**
 * StockOut wordmark. The Figma logo (node 653:28631) is a raster asset: export it to
 * src/assets/brand/stockout-logo.png (see docs/FIGMA_IMPLEMENTATION.md). Until that file exists the
 * component renders a text wordmark in the heading font so the layout stays intact.
 */
export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  if (brandLogoUrl) {
    return <img src={brandLogoUrl} alt="StockOut" className={cn(compact ? "h-6" : "h-[22px]", "w-auto select-none", className)} draggable={false} />;
  }
  return (
    <span className={cn("select-none font-heading font-bold tracking-tight text-foreground", compact ? "text-lg" : "text-xl", className)} aria-label="StockOut">
      {compact ? "SO" : "StockOut"}
    </span>
  );
}
