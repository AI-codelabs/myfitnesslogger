import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

interface ConnectFormProps {
  onConnect: (cookies: string, date?: string) => void;
  isLoading: boolean;
  error: string | null;
}

export const ConnectForm = ({ onConnect, isLoading, error }: ConnectFormProps) => {
  const [cookies, setCookies] = useState("");
  const [date, setDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cookies.trim()) return;
    onConnect(cookies.trim(), date);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <div>
          <label className="text-sm font-medium mb-2 block">
            Session Cookies
          </label>
          <Textarea
            placeholder='Paste your MFP cookies here (the "Cookie" header value from your browser network tab)'
            value={cookies}
            onChange={(e) => setCookies(e.target.value)}
            rows={5}
            className="resize-none font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Open MyFitnessPal in your browser → DevTools (F12) → Network tab → refresh → click any request → copy the <code className="px-1 py-0.5 rounded bg-muted">Cookie</code> header value.
          </p>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">
            Date
          </label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </div>

      <Button
        type="submit"
        disabled={isLoading || !cookies.trim()}
        className="w-full h-12 text-base font-semibold gradient-brand hover:opacity-90 transition-opacity border-0"
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Connecting...
          </span>
        ) : (
          "Connect & Fetch Food Log"
        )}
      </Button>
    </form>
  );
};
