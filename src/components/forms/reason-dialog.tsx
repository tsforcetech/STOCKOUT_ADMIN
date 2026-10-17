import * as React from "react";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { FormField } from "./form-field";

/**
 * Confirmation that collects a mandatory reason (disable user, suspend seller, reject listing…).
 * Keeps the dialog open and the text intact if the API call fails.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  reasonLabel = "Reason",
  required = true,
  maxLength = 500,
  loading,
  tone = "danger",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  reasonLabel?: string;
  required?: boolean;
  maxLength?: number;
  loading?: boolean;
  tone?: "danger" | "primary";
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  React.useEffect(() => {
    if (open) {
      setReason("");
      setTouched(false);
    }
  }, [open]);
  const invalid = required && reason.trim().length === 0;
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      tone={tone}
      loading={loading}
      onConfirm={() => {
        setTouched(true);
        if (!invalid) onConfirm(reason.trim());
      }}
    >
      <FormField label={reasonLabel} htmlFor="reason-input" required={required} error={touched && invalid ? "A reason is required." : undefined} hint={`${reason.length}/${maxLength}`}>
        <Textarea rows={3} maxLength={maxLength} value={reason} onChange={(e) => setReason(e.target.value)} />
      </FormField>
    </ConfirmDialog>
  );
}
