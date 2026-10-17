/**
 * Brand raster assets exported from Figma (see docs/FIGMA_IMPLEMENTATION.md). Resolved at build time:
 * when a file is not present the corresponding URL is undefined and components render their fallback.
 */
const files = import.meta.glob<string>("./*.{png,svg,webp,jpg}", { eager: true, query: "?url", import: "default" });

export const brandLogoUrl: string | undefined = files["./stockout-logo.png"] ?? files["./stockout-logo.svg"];
export const loginHeroUrl: string | undefined = files["./login-hero.png"] ?? files["./login-hero.webp"];
