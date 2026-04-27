"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  return (
    <div
      aria-hidden={!open}
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 transition-opacity duration-150 ${
        open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => !busy && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full max-w-sm rounded-xl border border-foreground/10 bg-background p-5 shadow-2xl transition-all duration-150 ${
          open ? "translate-y-0 scale-100" : "translate-y-2 scale-95"
        }`}
      >
        <h2 className="text-base font-semibold">{title}</h2>
        {description && (
          <p className="mt-1.5 text-sm text-foreground/65">{description}</p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={busy}
            className={
              destructive
                ? "bg-red-500 text-white hover:bg-red-500/90"
                : undefined
            }
          >
            {busy ? <Spinner /> : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      Working…
    </span>
  );
}
