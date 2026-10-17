import * as React from "react";
import { useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { FormError, FormField } from "@/components/forms/form-field";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { applyApiErrorToForm } from "@/lib/api/form-errors";
import { platformService } from "@/services/platform.service";
import type { PlatformRoleDetailResponse } from "@/api/types/user-organization";
import { teamKeys } from "./queries";
import { userOrgErrorCode, userOrgErrorMessage } from "./errors";

/** Mirrors CreatePlatformRoleRequest / UpdatePlatformRoleRequest DataAnnotations. */
const nameField = z.string().trim().min(1, "Name is required.").max(150, "Name must be at most 150 characters.");
const descriptionField = z.string().trim().max(500, "Description must be at most 500 characters.");
const createSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Code is required.")
    .max(100, "Code must be at most 100 characters.")
    .regex(/^[a-zA-Z0-9\-_]+$/, "Code can only contain letters, numbers, hyphens, and underscores."),
  name: nameField,
  description: descriptionField,
});
type Values = z.infer<typeof createSchema>;
const editSchema = createSchema.extend({ code: z.string() });

type Role = Pick<PlatformRoleDetailResponse, "platformRoleId" | "code" | "name" | "description">;

export function RoleFormDialog({ open, onOpenChange, role }: { open: boolean; onOpenChange: (open: boolean) => void; role?: Role | null }) {
  const navigate = useNavigate();
  const editing = Boolean(role);
  const [formError, setFormError] = React.useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(editing ? editSchema : createSchema), defaultValues: { code: "", name: "", description: "" } });

  React.useEffect(() => {
    if (open) {
      form.reset({ code: role?.code ?? "", name: role?.name ?? "", description: role?.description ?? "" });
      setFormError(null);
    }
  }, [open, role, form]);

  const mutation = useApiMutation({
    mutationFn: (v: Values) =>
      role
        ? platformService.updateRole(role.platformRoleId, { name: v.name, description: v.description || null })
        : platformService.createRole({ code: v.code, name: v.name, description: v.description || null }),
    invalidate: (d) => [teamKeys.roles, teamKeys.role(d.platformRoleId)],
    toastOnError: false,
    successMessage: (d) => (editing ? `Role "${d.name}" updated.` : `Role "${d.name}" created. Now choose its permissions.`),
    onSuccess: (d) => {
      onOpenChange(false);
      if (!editing) navigate(`/team/roles/${d.platformRoleId}`);
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    mutation.mutate(values, {
      onError: (error) => {
        if (userOrgErrorCode(error) === "DUPLICATE_ROLE_CODE") {
          form.setError("code", { type: "server", message: userOrgErrorMessage(error) });
          return;
        }
        const unmatched = applyApiErrorToForm(error, form.setError, ["code", "name", "description"]);
        if (unmatched) setFormError(userOrgErrorCode(error) ? userOrgErrorMessage(error) : unmatched);
      },
    });
  });

  const description = form.watch("description");

  return (
    <Dialog open={open} onOpenChange={(o) => !mutation.isPending && onOpenChange(o)}>
      <DialogContent
        title={editing ? "Edit role" : "Create role"}
        description={editing ? "The role code cannot be changed." : "New roles start active with no permissions."}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" form="role-form" loading={mutation.isPending}>
              {editing ? "Save changes" : "Create role"}
            </Button>
          </>
        }
      >
        <form id="role-form" onSubmit={onSubmit} noValidate className="space-y-4">
          <FormError message={formError} />
          <FormField label="Code" htmlFor="role-code" required={!editing} error={form.formState.errors.code?.message} hint="Letters, numbers, hyphens and underscores. Max 100.">
            <Input className="font-mono" maxLength={100} disabled={editing} autoComplete="off" {...form.register("code")} />
          </FormField>
          <FormField label="Name" htmlFor="role-name" required error={form.formState.errors.name?.message}>
            <Input maxLength={150} {...form.register("name")} />
          </FormField>
          <FormField label="Description" htmlFor="role-description" error={form.formState.errors.description?.message} hint={`${description?.length ?? 0}/500`}>
            <Textarea rows={3} maxLength={500} {...form.register("description")} />
          </FormField>
        </form>
      </DialogContent>
    </Dialog>
  );
}
