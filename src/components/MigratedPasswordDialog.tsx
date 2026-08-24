import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Eye, EyeOff, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  email: string;
  name?: string | null;
  submitting: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (password: string, confirmPassword: string) => Promise<void> | void;
}

export function MigratedPasswordDialog({
  open,
  email,
  name,
  submitting,
  onOpenChange,
  onSubmit,
}: Props) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPassword("");
    setConfirm("");
    setShowPassword(false);
    setShowConfirm(false);
  }, [open, email]);

  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = password.length >= 6 && password === confirm && !submitting;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (submitting) return;
        onOpenChange(next);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background md:bg-black/80" />
        <DialogPrimitive.Content
          aria-describedby="migrated-password-copy"
          className="fixed inset-0 z-50 flex h-[100dvh] max-h-[100dvh] w-full flex-col bg-background outline-none
            md:inset-auto md:left-1/2 md:top-1/2 md:h-auto md:max-h-[90dvh] md:w-full md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:border md:shadow-lg"
        >
          <form
            className="flex h-full min-h-0 flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              if (!canSubmit) return;
              void onSubmit(password, confirm);
            }}
          >
            <div className="flex items-start justify-between gap-3 px-5 pt-[max(1rem,env(safe-area-inset-top))] md:px-6 md:pt-5">
              <DialogPrimitive.Title className="pt-2 text-[1.75rem] font-semibold leading-tight md:text-xl">
                Set your password
              </DialogPrimitive.Title>
              <DialogPrimitive.Close
                disabled={submitting}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-6 w-6" />
              </DialogPrimitive.Close>
            </div>

            <div className="flex-1 overflow-y-auto px-5 md:px-6">
              <DialogPrimitive.Description
                id="migrated-password-copy"
                className="mt-3 text-base leading-relaxed text-muted-foreground md:text-sm"
              >
                We moved to a more secure login. Type the same password twice so we know it matches. You can reuse your old password.
              </DialogPrimitive.Description>
              <p className="mt-3 break-all text-base font-medium leading-snug">{email}</p>
              {name ? <p className="mt-1 text-sm text-muted-foreground">{name}</p> : null}

              <div className="mt-8 space-y-5 pb-4">
                <div className="space-y-2">
                  <Label htmlFor="migrated-password" className="text-base md:text-sm">
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="migrated-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      enterKeyHint="next"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      autoFocus
                      className="h-14 pr-14 text-base md:text-base"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-1.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="migrated-confirm" className="text-base md:text-sm">
                    Confirm password
                  </Label>
                  <div className="relative">
                    <Input
                      id="migrated-confirm"
                      type={showConfirm ? "text" : "password"}
                      autoComplete="new-password"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      enterKeyHint="done"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      required
                      minLength={6}
                      className="h-14 pr-14 text-base md:text-base"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((s) => !s)}
                      className="absolute right-1.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
                      aria-label={showConfirm ? "Hide password" : "Show password"}
                    >
                      {showConfirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  {mismatch && (
                    <p className="text-sm text-destructive">Passwords do not match</p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-auto space-y-2 border-t bg-background px-5 py-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:px-6">
              <Button type="submit" disabled={!canSubmit} className="h-14 w-full text-base">
                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Save and continue"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-14 w-full text-base"
                disabled={submitting}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
