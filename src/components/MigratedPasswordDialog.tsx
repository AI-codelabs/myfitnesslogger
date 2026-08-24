import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="inset-0 left-0 top-0 flex h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 shadow-none data-[state=open]:zoom-in-100
          sm:inset-auto sm:left-[50%] sm:top-[50%] sm:h-auto sm:max-h-[90dvh] sm:max-w-md sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:border sm:shadow-lg
          [&>button]:right-3 [&>button]:top-3 [&>button]:flex [&>button]:h-11 [&>button]:w-11 [&>button]:items-center [&>button]:justify-center"
      >
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit) return;
            void onSubmit(password, confirm);
          }}
        >
          <div className="flex-1 overflow-y-auto px-5 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6 sm:pt-6">
            <DialogHeader className="space-y-3 pr-12 text-left">
              <DialogTitle className="text-[1.75rem] leading-tight sm:text-xl">
                Set your password
              </DialogTitle>
              <DialogDescription className="text-base leading-relaxed sm:text-sm">
                We moved to a more secure login. Type the same password twice for{" "}
                <span className="font-medium text-foreground break-all">{email}</span>
                {name ? ` (${name})` : ""}. You can reuse your old password.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-8 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="migrated-password" className="text-base sm:text-sm">
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
                    className="h-14 text-base pr-14 md:text-base"
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
                <Label htmlFor="migrated-confirm" className="text-base sm:text-sm">
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
                    className="h-14 text-base pr-14 md:text-base"
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

          <div className="mt-auto space-y-2 border-t bg-background px-5 py-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6">
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
      </DialogContent>
    </Dialog>
  );
}
