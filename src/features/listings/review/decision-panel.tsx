import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { SectionCard } from "@/components/common/section-card";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useAccess } from "@/lib/auth/use-access";
import { PERMISSIONS as P } from "@/api/types/user-organization";
import type {
  CandidateVersionDto,
  ModerationDecision,
  ModerationDecisionResponse,
} from "@/api/types/catalog-moderation";
import { moderationService } from "@/services/moderation.service";
import { inspectionKeys } from "@/features/inspections/queries";
import { listingKeys } from "../queries";
import { ApiErrorNotice, Notice, PanelTitle, isConflict } from "../shared";

const DECISIONS: Array<{
  value: ModerationDecision;
  label: string;
  hint: string;
}> = [
  {
    value: "APPROVE",
    label: "Approve",
    hint: "Version becomes Approved, or Inspection required when an inspection applies.",
  },
  {
    value: "REQUEST_CHANGES",
    label: "Request changes",
    hint: "Returned to the seller to edit and resubmit.",
  },
  {
    value: "REJECT",
    label: "Reject",
    hint: "Final. The seller cannot resubmit this version.",
  },
];

function buildSchema(categoryRequires: boolean) {
  return z
    .object({
      decision: z.enum(["APPROVE", "REQUEST_CHANGES", "REJECT"]),
      reasonCode: z
        .string()
        .trim()
        .max(100, "Keep the reason code under 100 characters."),
      sellerNotes: z
        .string()
        .max(2000, "Keep seller notes under 2000 characters."),
      internalNotes: z
        .string()
        .max(2000, "Keep internal notes under 2000 characters."),
      inspection: z.enum(["policy", "force", "waive"]),
    })
    .superRefine((v, ctx) => {
      if (v.decision !== "APPROVE" && !v.reasonCode)
        ctx.addIssue({
          code: "custom",
          path: ["reasonCode"],
          message: "A reason code is required to request changes or reject.",
        });
      const waiving =
        v.decision === "APPROVE" &&
        categoryRequires &&
        v.inspection === "waive";
      if (waiving && !v.reasonCode)
        ctx.addIssue({
          code: "custom",
          path: ["reasonCode"],
          message: "A reason code is required to waive the inspection.",
        });
      if (waiving && !v.internalNotes.trim())
        ctx.addIssue({
          code: "custom",
          path: ["internalNotes"],
          message: "Internal notes are required to waive the inspection.",
        });
    });
}
type Values = z.infer<ReturnType<typeof buildSchema>>;

/** Decide panel. Rendered only while the version is UNDER_REVIEW and the user has catalog:listings:approve. */
export function DecisionPanel({
  candidate,
  onDecided,
}: {
  candidate: CandidateVersionDto;
  onDecided: (result: ModerationDecisionResponse) => void;
}) {
  const { can } = useAccess();
  const queryClient = useQueryClient();
  const canOverride = can(P.INSPECTIONS_OVERRIDE);
  const requires = candidate.categoryRequiresPhysicalInspection;
  const schema = React.useMemo(() => buildSchema(requires), [requires]);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      decision: "APPROVE",
      reasonCode: "",
      sellerNotes: "",
      internalNotes: "",
      inspection: "policy",
    },
  });
  const decision = useWatch({ control: form.control, name: "decision" });
  const inspection = useWatch({ control: form.control, name: "inspection" });
  const waiving = decision === "APPROVE" && requires && inspection === "waive";

  const mutation = useApiMutation({
    mutationFn: async (v: Values) => {
      const override =
        v.decision !== "APPROVE" || v.inspection === "policy"
          ? null
          : v.inspection === "force";
      try {
        return await moderationService.decide(
          candidate.listingId,
          candidate.listingVersionId,
          {
            decision: v.decision,
            reasonCode: v.reasonCode.trim() || null,
            sellerNotes: v.sellerNotes.trim() || null,
            internalNotes: v.internalNotes.trim() || null,
            requiresInspectionOverride: override,
            expectedRowVersion: candidate.listingRowVersion,
          },
        );
      } catch (error) {
        if (isConflict(error))
          await queryClient.invalidateQueries({
            queryKey: listingKeys.listing(candidate.listingId),
          });
        throw error;
      }
    },
    toastOnError: false,
    invalidate: [
      listingKeys.listing(candidate.listingId),
      listingKeys.queueAll,
      inspectionKeys.queueAll,
    ],
    successMessage: (r) =>
      r.versionStatus === "APPROVED"
        ? "Approved. It isn't live yet — publish it in the Publication panel to make it visible to buyers."
        : `Decision recorded: ${r.versionStatus.replace(/_/g, " ").toLowerCase()}.`,
    onSuccess: (r) => {
      form.reset();
      onDecided(r);
    },
  });

  const errors = form.formState.errors;
  const reasonRequired = decision !== "APPROVE" || waiving;

  return (
    <SectionCard>
      <PanelTitle
        title="Moderation decision"
        description={`Version v${candidate.versionNumber} is waiting for a decision.`}
      />
      <form
        onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
        noValidate
        className="space-y-4"
      >
        <fieldset>
          <legend className="mb-2 text-sm text-body">Decision</legend>
          <div className="grid gap-2" role="radiogroup">
            {DECISIONS.map((d) => (
              <label
                key={d.value}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors focus-within:outline-2 focus-within:outline-ring",
                  decision === d.value
                    ? "border-action-border bg-action-soft"
                    : "border-border hover:bg-surface-muted",
                )}
              >
                <input
                  type="radio"
                  value={d.value}
                  className="mt-1 accent-current"
                  {...form.register("decision")}
                />
                <span>
                  <span className="block font-medium">{d.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {d.hint}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {decision === "APPROVE" && (
          <FormField
            label="Physical inspection"
            htmlFor="decide-inspection"
            hint={
              requires
                ? canOverride
                  ? "The category requires inspection. Waiving it needs a reason code and internal notes."
                  : "The category requires inspection. Waiving it needs the inspections.override permission."
                : "The category does not require inspection. You can still force one."
            }
          >
            <NativeSelect {...form.register("inspection")}>
              <option value="policy">
                {requires
                  ? "Follow category policy (inspection required)"
                  : "Follow category policy (no inspection)"}
              </option>
              {requires ? (
                canOverride && <option value="waive">Waive inspection</option>
              ) : (
                <option value="force">Force an inspection</option>
              )}
            </NativeSelect>
          </FormField>
        )}

        {waiving && (
          <Notice tone="warning">
            Waiving skips the physical inspection required by this category.
            This is recorded with your reason and internal notes.
          </Notice>
        )}

        <FormField
          label="Reason code"
          htmlFor="decide-reason"
          required={reasonRequired}
          error={errors.reasonCode?.message}
          hint="Free text, e.g. MISSING_IMAGES or PROHIBITED_ITEM."
        >
          <Input
            maxLength={100}
            autoComplete="off"
            {...form.register("reasonCode")}
          />
        </FormField>
        <FormField
          label="Notes to seller"
          htmlFor="decide-seller-notes"
          error={errors.sellerNotes?.message}
          hint="Visible to the seller."
        >
          <Textarea
            rows={3}
            maxLength={2000}
            {...form.register("sellerNotes")}
          />
        </FormField>
        <FormField
          label="Internal notes"
          htmlFor="decide-internal-notes"
          required={waiving}
          error={errors.internalNotes?.message}
          hint="Visible to admins only."
        >
          <Textarea
            rows={3}
            maxLength={2000}
            {...form.register("internalNotes")}
          />
        </FormField>

        <ApiErrorNotice error={mutation.error} />

        <div className="flex justify-end">
          <Button
            type="submit"
            variant={decision === "APPROVE" ? "primary" : "danger"}
            loading={mutation.isPending}
          >
            {decision === "APPROVE"
              ? "Approve version"
              : decision === "REJECT"
                ? "Reject version"
                : "Request changes"}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}
