import { useQuery } from "@tanstack/react-query";
import { platformService } from "@/services/platform.service";

export const settingsKeys = {
  settings: ["platform", "settings"] as const,
  featureFlags: ["platform", "feature-flags"] as const,
};

export function useSettingsQuery(enabled = true) {
  return useQuery({ queryKey: settingsKeys.settings, queryFn: ({ signal }) => platformService.settings(signal), enabled });
}

export function useFeatureFlagsQuery(enabled = true) {
  return useQuery({ queryKey: settingsKeys.featureFlags, queryFn: ({ signal }) => platformService.featureFlags(signal), enabled });
}
