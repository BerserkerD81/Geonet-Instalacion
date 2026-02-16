import * as React from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "./utils";

type Tone = "primary" | "accent";

type TimeSelectProps = {
  id?: string;
  value?: string;
  onValueChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  tone?: Tone;
  disabled?: boolean;
  className?: string;
};

export function TimeSelect({
  id,
  value,
  onValueChange,
  options,
  placeholder = "Seleccionar hora",
  tone = "primary",
  disabled,
  className,
}: TimeSelectProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const dropdownRef = React.useRef<HTMLDivElement | null>(null);
  const [dropdownStyle, setDropdownStyle] = React.useState<React.CSSProperties | null>(null);

  React.useEffect(() => {
    if (!open) return;

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target || !rootRef.current) return;
      const clickedInsideRoot = rootRef.current.contains(target);
      const clickedInsideDropdown = dropdownRef.current ? dropdownRef.current.contains(target) : false;
      if (!clickedInsideRoot && !clickedInsideDropdown) setOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Position dropdown in document.body so it appears above all containers
  React.useEffect(() => {
    if (!open) {
      setDropdownStyle(null);
      return;
    }

    const updatePosition = () => {
      const btn = buttonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const DROPDOWN_MAX_HEIGHT = 240; // px
      const spaceBelow = viewportHeight - rect.bottom;
      const placeBelow = spaceBelow >= 160 || spaceBelow > rect.top; // prefer below when reasonable

      const top = placeBelow ? rect.bottom + 8 : Math.max(8, rect.top - DROPDOWN_MAX_HEIGHT - 8);
      const left = Math.max(8, Math.min(rect.left, viewportWidth - rect.width - 8));
      setDropdownStyle({
        position: 'fixed',
        top: Math.round(top) + 'px',
        left: Math.round(left) + 'px',
        width: Math.round(rect.width) + 'px',
        maxHeight: DROPDOWN_MAX_HEIGHT + 'px',
        zIndex: 9999,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition, { passive: true });
    window.addEventListener('scroll', updatePosition, { passive: true });
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition);
    };
  }, [open]);

  const toneStyles =
    tone === "accent"
      ? {
          border: "border-accent/30",
          focus: "focus-visible:ring-accent/25 focus-visible:border-accent",
          itemActive: "bg-accent text-accent-foreground",
          itemHover: "hover:bg-accent/10",
        }
      : {
          border: "border-primary/30",
          focus: "focus-visible:ring-primary/25 focus-visible:border-primary",
          itemActive: "bg-primary text-primary-foreground",
          itemHover: "hover:bg-primary/10",
        };

  const selectValue = value ?? "";

  return (
    <div ref={rootRef} className={cn("relative z-30", className)}>
      <button
        id={id}
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "h-12 w-full rounded-xl border-2 bg-white px-3 text-left text-sm transition-all",
          "flex items-center justify-between gap-3",
          "disabled:cursor-not-allowed disabled:opacity-60",
          toneStyles.border,
          toneStyles.focus,
          open ? "shadow-md" : "",
        )}
      >
        <span className={cn(selectValue ? "text-gray-900" : "text-gray-500")}>
          {selectValue || placeholder}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-gray-500 transition-transform", open && "rotate-180")} />
      </button>

      {open && dropdownStyle && createPortal(
        <div
          role="listbox"
          tabIndex={-1}
          ref={dropdownRef}
          style={dropdownStyle}
          className={cn(
            "overflow-hidden rounded-xl border bg-white shadow-2xl ring-1 ring-black/5",
            "overflow-y-auto",
            "border-gray-200",
          )}
        >
          <div className="p-1">
            {options.map((opt) => {
              const isActive = opt === selectValue;
              return (
                <button
                  key={opt}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => {
                    onValueChange(opt);
                    setOpen(false);
                    buttonRef.current?.focus();
                  }}
                  className={cn(
                    "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    isActive ? toneStyles.itemActive : cn("text-gray-800", toneStyles.itemHover),
                  )}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
