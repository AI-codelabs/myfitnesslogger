import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface MfpLoginFormProps {
  onLogin: (email: string, password: string) => void;
  onCookieConnect: (cookies: string) => void;
  isLoading: boolean;
  error: string | null;
}

export const MfpLoginForm = ({ onLogin, onCookieConnect, isLoading, error }: MfpLoginFormProps) => {
  const [mode, setMode] = useState<"login" | "cookie">("cookie");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cookies, setCookies] = useState("");

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    onLogin(email.trim(), password.trim());
  };

  const handleCookieSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cookies.trim()) return;
    onCookieConnect(cookies.trim());
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold tracking-tight mb-3">Connect MyFitnessPal</h2>
        <p className="text-muted-foreground leading-relaxed">
          Connect your account to view your food diary here.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex rounded-lg border border-border bg-muted/50 p-1 mb-6">
        <button
          type="button"
          onClick={() => setMode("cookie")}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
            mode === "cookie"
              ? "bg-card shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Paste Cookie
        </button>
        <button
          type="button"
          onClick={() => setMode("login")}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
            mode === "login"
              ? "bg-card shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Email & Password
        </button>
      </div>

      {mode === "cookie" ? (
        <form onSubmit={handleCookieSubmit} className="space-y-5">
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Session Cookie</label>
              <Textarea
                value={cookies}
                onChange={(e) => setCookies(e.target.value)}
                placeholder="Paste your full Cookie header value here"
                rows={5}
                className="resize-none font-mono text-xs"
              />
            </div>
            <div className="rounded-lg bg-muted px-4 py-3 space-y-2">
              <p className="text-xs font-medium text-foreground">How to get your cookies:</p>
              <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                <li>Open <a href="https://www.myfitnesspal.com" target="_blank" rel="noopener" className="text-primary underline">myfitnesspal.com</a> and make sure you're logged in</li>
                <li>Press <kbd className="px-1 py-0.5 rounded bg-background border text-[10px]">F12</kbd> to open DevTools</li>
                <li>Go to the <strong>Network</strong> tab and refresh the page</li>
                <li>Click any request to <code className="text-[10px] px-1 py-0.5 rounded bg-background border">www.myfitnesspal.com</code></li>
                <li>Find the <code className="text-[10px] px-1 py-0.5 rounded bg-background border">Cookie</code> header in "Request Headers"</li>
                <li>Copy the <strong>entire value</strong> and paste it above</li>
              </ol>
              <p className="text-[10px] text-muted-foreground/70 mt-2">
                The key cookie is <code className="px-1 py-0.5 rounded bg-background border">__Secure-next-auth.session-token</code> — make sure it's included.
              </p>
            </div>
            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>
          <Button type="submit" disabled={isLoading || !cookies.trim()} className="w-full h-12 text-base font-semibold gradient-brand hover:opacity-90 transition-opacity border-0">
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Connecting...
              </span>
            ) : "Connect"}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleLoginSubmit} className="space-y-5">
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="rounded-lg bg-accent/30 border border-accent/50 px-4 py-3 text-xs text-muted-foreground">
              ⚠️ Direct login may be blocked by MyFitnessPal's captcha protection. If it fails, use the <button type="button" onClick={() => setMode("cookie")} className="text-primary underline font-medium">cookie paste</button> method instead.
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">MyFitnessPal Email</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your-mfp-email@example.com" required />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">MyFitnessPal Password</label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>
          <Button type="submit" disabled={isLoading} className="w-full h-12 text-base font-semibold gradient-brand hover:opacity-90 transition-opacity border-0">
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Connecting...
              </span>
            ) : "Connect & Sync"}
          </Button>
        </form>
      )}
    </div>
  );
};
