"use client";

import type { ReactNode } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  confirming?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  confirming = false,
  onOpenChange,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
        <AlertDialog.Popup className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
          <div className="border-b border-border px-5 py-4">
            <AlertDialog.Title className="text-lg font-semibold text-foreground">
              {title}
            </AlertDialog.Title>
          </div>
          <AlertDialog.Description className="px-5 py-4 text-sm leading-6 text-muted-foreground">
            {description}
          </AlertDialog.Description>
          <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
            <AlertDialog.Close
              render={
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  disabled={confirming}
                >
                  {cancelLabel}
                </Button>
              }
            />
            <Button
              type="button"
              variant="destructive"
              className="rounded-xl"
              disabled={confirming}
              onClick={onConfirm}
            >
              {confirming ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Deleting...
                </>
              ) : (
                confirmLabel
              )}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
