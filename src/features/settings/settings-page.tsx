import { SlidersHorizontalIcon } from "@phosphor-icons/react";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { PermissionDenied } from "@/components/feedback/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { useAccess } from "@/lib/auth/use-access";
import { useUrlState } from "@/hooks/use-url-state";
import { PERMISSIONS as P } from "@/api/types/user-organization";
import { PlatformSettingsPanel } from "./platform-settings-panel";
import { FeatureFlagsPanel } from "./feature-flags-panel";

export default function SettingsPage() {
  const { can } = useAccess();
  const tabs = [
    { value: "platform", label: "Platform settings", allowed: can(P.SETTINGS_VIEW) },
    { value: "flags", label: "Feature flags", allowed: can(P.FEATURE_FLAGS_VIEW) },
  ].filter((t) => t.allowed);
  const [state, setState] = useUrlState({ tab: "" });
  const active = tabs.find((t) => t.value === state.tab)?.value ?? tabs[0]?.value;

  return (
    <>
      <PageHeader eyebrow="StockOut administration" title="Settings" description="Platform configuration values and feature flags. Changes use optimistic concurrency — if someone else edits first, you'll be asked to review the latest value." />
      {!active ? (
        <PermissionDenied />
      ) : (
        <SectionCard>
          <Tabs value={active} onValueChange={(tab) => setState({ tab })}>
            <TabsList aria-label="Settings sections">
              {tabs.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.value === "platform" && <SlidersHorizontalIcon className="mr-1 inline size-4" aria-hidden />}
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {tabs.some((t) => t.value === "platform") && (
              <TabsContent value="platform">
                <PlatformSettingsPanel />
              </TabsContent>
            )}
            {tabs.some((t) => t.value === "flags") && (
              <TabsContent value="flags">
                <FeatureFlagsPanel />
              </TabsContent>
            )}
          </Tabs>
        </SectionCard>
      )}
    </>
  );
}
