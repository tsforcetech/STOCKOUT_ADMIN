import type * as React from "react";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogContent } from "@/components/ui/dialog";

/**
 * Dialog body for a react-hook-form form. Render it only while the dialog is open
 * (`{open && <XForm/>}`) so each opening mounts a fresh form seeded from the latest record.
 */
export function FormDialogContent({
  formId,
  title,
  description,
  size,
  submitLabel = "Save",
  submitting,
  submitDisabled,
  onSubmit,
  children,
}: {
  formId: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  submitLabel?: string;
  submitting: boolean;
  submitDisabled?: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <DialogContent
      title={title}
      description={description}
      size={size}
      onInteractOutside={(e) => {
        // Avoid losing typed values to a stray click outside.
        e.preventDefault();
      }}
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary" disabled={submitting}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" form={formId} loading={submitting} disabled={submitDisabled}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={onSubmit} className="space-y-4">
        {children}
      </form>
    </DialogContent>
  );
}
