import type * as React from "react";
import { Logo } from "@/components/common/logo";
import { loginHeroUrl } from "@/assets/brand";

/**
 * Figma "Login" frame (385:2169): left brand panel, right card on white.
 * The left panel's photograph is a Figma raster asset; it is loaded from
 * src/assets/brand/login-hero.png when exported, otherwise the panel renders its text treatment only.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-surface p-4 sm:p-6">
      <aside className="relative hidden w-[47%] max-w-[760px] shrink-0 overflow-hidden rounded-xl bg-surface-muted lg:flex lg:flex-col" aria-hidden>
        <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent_0_14px,rgba(0,0,0,0.018)_14px_15px)]" />
        <div className="relative flex flex-1 items-center justify-center p-12">
          <div className="relative w-full max-w-[460px]">
            <div className="relative overflow-hidden rounded-xl bg-[#2d2d2b] p-10 pb-28 text-white">
              <p className="font-heading text-[40px] font-bold leading-[44px]">
                One Console.
                <br />
                Manage the entire marketplace.
              </p>
              {loginHeroUrl && <img src={loginHeroUrl} alt="" className="pointer-events-none absolute -bottom-2 -left-4 h-[85%] w-auto object-contain" />}
            </div>
            <div className="absolute -bottom-8 right-0 max-w-[260px] rounded-lg bg-[#fac02a] px-4 py-3 text-lg leading-6 text-foreground">
              Manage products, resources, orders, and operations from one place.
            </div>
          </div>
        </div>
        <div className="relative px-12 pb-10">
          <Logo />
        </div>
      </aside>

      <section className="relative flex min-w-0 flex-1 flex-col rounded-xl border border-border bg-surface lg:ml-6">
        <div className="px-6 pt-8 sm:px-10">
          <Logo className="h-[26px]" />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">{children}</div>
        <footer className="pb-6 text-center text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()}. All rights reserved.</p>
        </footer>
      </section>
    </div>
  );
}

/** Figma "Sign in" card: 24px radius, #c9c9c6 border, centred H3 + subtitle. */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[504px] rounded-xl border border-secondary-border bg-surface px-6 py-12 sm:px-8 sm:py-16">
      <div className="mb-10 text-center sm:mb-14">
        <h1 className="font-heading text-[28px] font-bold leading-9 text-foreground sm:text-[32px] sm:leading-10">{title}</h1>
        {subtitle && <p className="mt-2 text-lg leading-6 tracking-[-0.03em] text-body/60 sm:text-xl">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
