import * as React from "react";
import { Select as S } from "radix-ui";
import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils/cn";
import { inputClass } from "./input-class";

interface Option {
  value: string;
  label: React.ReactNode;
  text: string;
  disabled: boolean;
}

/** Radix item values can't be empty strings; "" (e.g. "All categories") is mapped to this sentinel. */
const EMPTY = "__so_empty__";
const VALUE = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!;

function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

function collectOptions(children: React.ReactNode, out: Option[] = []): Option[] {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement<{ children?: React.ReactNode; value?: unknown; disabled?: boolean }>(child)) return;
    if (child.type === React.Fragment) {
      collectOptions(child.props.children, out);
      return;
    }
    if (child.type === "option") {
      const text = textOf(child.props.children);
      out.push({ value: child.props.value != null ? String(child.props.value) : text, label: child.props.children, text, disabled: !!child.props.disabled });
    }
  });
  return out;
}

type Props = React.SelectHTMLAttributes<HTMLSelectElement> & { placeholder?: string };

/**
 * Drop-in replacement for a native <select> with a styled dropdown (Radix Select).
 * Takes the same props and <option> children. A hidden native <select> keeps the real value, so react-hook-form's
 * register(), form submission, `required` and onChange(e.target.value) all behave exactly as before.
 */
export const NativeSelect = React.forwardRef<HTMLSelectElement, Props>(function NativeSelect(
  {
    className,
    children,
    value,
    defaultValue,
    onChange,
    onBlur,
    disabled,
    id,
    placeholder,
    title,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
    ...rest
  },
  ref,
) {
  const options = collectOptions(children);
  const selectRef = React.useRef<HTMLSelectElement | null>(null);
  const controlled = value !== undefined;
  const [inner, setInner] = React.useState<string>(defaultValue != null ? String(defaultValue) : (options[0]?.value ?? ""));
  const current = controlled ? String(value) : inner;
  const setInnerRef = React.useRef(setInner);
  const selected = options.find((o) => o.value === current);

  const setRefs = React.useCallback(
    (el: HTMLSelectElement | null) => {
      selectRef.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) ref.current = el;
      if (el && !controlled) {
        // react-hook-form (register/reset/setValue) writes `select.value` directly; mirror those writes through a
        // per-element prototype (jsdom's select proxy rejects own accessors, browsers accept either).
        if (!(el as { __soPatched?: boolean }).__soPatched) {
          const proto = Object.create(Object.getPrototypeOf(el), {
            value: {
              configurable: true,
              get() {
                return VALUE.get!.call(this);
              },
              set(v: string) {
                VALUE.set!.call(this, v);
                setInnerRef.current(VALUE.get!.call(this) as string);
              },
            },
            __soPatched: { value: true },
          });
          Object.setPrototypeOf(el, proto);
        }
        setInner(el.value);
      }
    },
    [ref, controlled],
  );

  const choose = (v: string) => {
    const next = v === EMPTY ? "" : v;
    const el = selectRef.current;
    if (el) {
      VALUE.set!.call(el, next);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (!controlled) setInner(next);
  };

  return (
    <>
      <select
        {...rest}
        ref={setRefs}
        {...(controlled ? { value } : { defaultValue })}
        onChange={onChange ?? (() => undefined)}
        onBlur={onBlur}
        disabled={disabled}
        aria-hidden
        tabIndex={-1}
        className="sr-only"
      >
        {children}
      </select>
      <S.Root
        value={current === "" ? EMPTY : current}
        onValueChange={choose}
        disabled={disabled}
        onOpenChange={(open) => {
          if (!open) selectRef.current?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
        }}
      >
        <S.Trigger
          id={id}
          title={title}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          className={cn(inputClass, "cursor-pointer items-center justify-between gap-2 py-0 text-left data-[placeholder]:text-muted-foreground data-[state=open]:border-action-border", className)}
        >
          <span className={cn("min-w-0 truncate", !selected?.text && "text-muted-foreground")}>{selected ? selected.label : (placeholder ?? "Select…")}</span>
          <S.Icon asChild>
            <CaretDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" aria-hidden />
          </S.Icon>
        </S.Trigger>
        <S.Portal>
          <S.Content
            position="popper"
            sideOffset={6}
            collisionPadding={12}
            className="z-[80] max-h-[min(360px,var(--radix-select-content-available-height))] min-w-[max(var(--radix-select-trigger-width),10rem)] overflow-hidden rounded-xl border border-border bg-surface p-1 text-foreground shadow-raised data-[state=open]:animate-[fade-in_120ms_ease-out]"
          >
            <S.Viewport>
              {options.map((o) => (
                <S.Item
                  key={o.value || EMPTY}
                  value={o.value === "" ? EMPTY : o.value}
                  disabled={o.disabled}
                  textValue={o.text}
                  className="relative flex cursor-pointer select-none items-center rounded-lg py-2 pl-8 pr-3 text-sm outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-surface-muted data-[state=checked]:font-medium"
                >
                  <S.ItemIndicator className="absolute left-2.5 inline-flex">
                    <CheckIcon className="size-4" weight="bold" />
                  </S.ItemIndicator>
                  <S.ItemText>{o.label}</S.ItemText>
                </S.Item>
              ))}
            </S.Viewport>
          </S.Content>
        </S.Portal>
      </S.Root>
    </>
  );
});
