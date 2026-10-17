import * as React from "react";
import { cn } from "@/lib/utils/cn";

/** Figma "Field": 40px, 1px #e1e1e0 border, 8px radius, 14px text, #74756c placeholder. */
export const inputClass =
  "flex h-10 w-full min-w-0 rounded-md border border-input bg-surface px-3 py-2 text-sm text-foreground transition-colors placeholder:text-muted-foreground hover:border-secondary-border focus-visible:border-action-border focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-action/60 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/20";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => (
    <input ref={ref} type={type} className={cn(inputClass, "file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium", className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, rows = 4, ...props }, ref) => (
    <textarea ref={ref} rows={rows} className={cn(inputClass, "h-auto min-h-20 leading-relaxed", className)} {...props} />
  ),
);
Textarea.displayName = "Textarea";

export const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        inputClass,
        "cursor-pointer appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 256 256%22><path fill=%22%231a1a1a%22 d=%22M213.66 101.66l-80 80a8 8 0 0 1-11.32 0l-80-80a8 8 0 0 1 11.32-11.32L128 164.69l74.34-74.35a8 8 0 0 1 11.32 11.32Z%22/></svg>')] bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
NativeSelect.displayName = "NativeSelect";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm leading-[18px] text-body", className)} {...props} />;
}
