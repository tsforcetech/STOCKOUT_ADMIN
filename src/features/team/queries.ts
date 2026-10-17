import { useQuery } from "@tanstack/react-query";
import { platformService } from "@/services/platform.service";
import type { ListPlatformInvitationsQuery } from "@/api/types/user-organization";

/** Query keys for the Team & Access module. Lists are complete arrays (no server pagination). */
export const teamKeys = {
  users: ["platform", "users"] as const,
  user: (userId: string) => ["platform", "users", userId] as const,
  invitationsAll: ["platform", "invitations"] as const,
  invitations: (query: ListPlatformInvitationsQuery) => ["platform", "invitations", "list", query.status ?? "", query.email ?? ""] as const,
  invitation: (id: string) => ["platform", "invitations", "detail", id] as const,
  roles: ["platform", "roles"] as const,
  assignableRoles: ["platform", "roles", "assignable"] as const,
  role: (roleId: string) => ["platform", "roles", "detail", roleId] as const,
  permissions: ["platform", "permissions"] as const,
  admins: ["platform", "admins"] as const,
  adminRoles: (userId: string) => ["platform", "admins", "roles", userId] as const,
};

export function useUsersQuery(enabled = true) {
  return useQuery({ queryKey: teamKeys.users, queryFn: ({ signal }) => platformService.users(signal), enabled });
}

export function useUserQuery(userId: string, enabled = true) {
  return useQuery({ queryKey: teamKeys.user(userId), queryFn: ({ signal }) => platformService.user(userId, signal), enabled: enabled && Boolean(userId) });
}

export function useInvitationsQuery(query: ListPlatformInvitationsQuery, enabled = true) {
  return useQuery({ queryKey: teamKeys.invitations(query), queryFn: ({ signal }) => platformService.invitations(query, signal), enabled });
}

export function useRolesQuery(enabled = true) {
  return useQuery({ queryKey: teamKeys.roles, queryFn: ({ signal }) => platformService.roles(signal), enabled });
}

export function useAssignableRolesQuery(enabled = true) {
  return useQuery({ queryKey: teamKeys.assignableRoles, queryFn: ({ signal }) => platformService.assignableRoles(signal), enabled });
}

export function useRoleQuery(roleId: string, enabled = true) {
  return useQuery({ queryKey: teamKeys.role(roleId), queryFn: ({ signal }) => platformService.role(roleId, signal), enabled: enabled && Boolean(roleId) });
}

export function usePermissionsQuery(enabled = true) {
  return useQuery({ queryKey: teamKeys.permissions, queryFn: ({ signal }) => platformService.permissions(signal), enabled, staleTime: 5 * 60_000 });
}

export function useAdminsQuery(enabled = true) {
  return useQuery({ queryKey: teamKeys.admins, queryFn: ({ signal }) => platformService.admins(signal), enabled });
}

/** Real role codes of a user. PlatformSuperAdmin only (works around the empty roles[] bug in /platform/users). */
export function useAdminRolesQuery(userId: string, enabled = true) {
  return useQuery({ queryKey: teamKeys.adminRoles(userId), queryFn: ({ signal }) => platformService.adminRoles(userId, signal), enabled: enabled && Boolean(userId) });
}
