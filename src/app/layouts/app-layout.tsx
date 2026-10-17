import * as React from "react";
import { Outlet, useLocation, useNavigation } from "react-router";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { ErrorBoundary } from "@/components/feedback/error-boundary";
import { PageSkeleton } from "@/components/feedback/states";
import { Logo } from "@/components/common/logo";
import { cn } from "@/lib/utils/cn";
import { SidebarNav, SidebarUser } from "./sidebar";
import { Breadcrumbs, TopBar } from "./header";

const COLLAPSE_KEY = "stockout.admin.sidebar.collapsed";

/** Figma "Dashboard" frame: full-width top bar, white sidebar, grey rounded content canvas. */
export function AppLayout() {
  const [collapsed, setCollapsed] = React.useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const location = useLocation();
  const navigation = useNavigation();
  const mainRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    mainRef.current?.scrollTo?.({ top: 0 });
  }, [location.pathname]);

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-action focus:px-3 focus:py-2 focus:text-foreground">
        Skip to content
      </a>
      <TopBar onOpenMobileNav={() => setMobileOpen(true)} />
      {navigation.state === "loading" && <div className="fixed inset-x-0 top-0 z-50 h-0.5 animate-pulse bg-action-border" role="progressbar" aria-label="Loading page" />}

      <div className="flex min-h-0 flex-1">
        <aside className={cn("sticky top-[71px] hidden h-[calc(100dvh-71px)] shrink-0 flex-col bg-sidebar transition-[width] duration-200 lg:flex", collapsed ? "w-[76px]" : "w-[262px]")}>
          <SidebarNav collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
          <SidebarUser collapsed={collapsed} />
        </aside>

        <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent title="Navigation" className="bg-sidebar">
            <div className="flex h-[71px] items-center px-6">
              <Logo />
            </div>
            <SidebarNav collapsed={false} showCollapseToggle={false} onNavigate={() => setMobileOpen(false)} />
            <SidebarUser collapsed={false} />
          </SheetContent>
        </Dialog>

        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className="min-w-0 flex-1 bg-surface-muted px-4 py-6 focus:outline-none sm:px-6 lg:rounded-tl-xl lg:border-l lg:border-t lg:border-border lg:px-8 lg:py-8"
        >
          <div className="mx-auto w-full max-w-[1320px]">
            <Breadcrumbs className="mb-3 px-0 sm:px-3" />
            <ErrorBoundary resetKey={location.pathname}>
              <React.Suspense fallback={<PageSkeleton />}>
                <Outlet />
              </React.Suspense>
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
