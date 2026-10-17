import { useState } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * StockOut wordmark. The Figma logo (node 653:28631) is a raster asset that must be exported to
 * public/brand/stockout-logo.png (see docs/FIGMA_IMPLEMENTATION.md). Until that file exists the
 * component renders a text fallback in the heading font so the layout stays intact.
 */
export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!failed) {
    return (
      <img
        src="/brand/stockout-logo.png"
        alt="StockOut"
        className={cn(compact ? "h-6" : "h-[22px]", "w-auto select-none", className)}
        onError={() => setFailed(true)}
        draggable={false}
      />
    );
  }
  return (
    <span className={cn("select-none font-heading font-bold tracking-tight text-foreground", compact ? "text-lg" : "text-xl", className)} aria-label="StockOut">
      {compact ? "SO" : "StockOut"}
    </span>
  );
}
