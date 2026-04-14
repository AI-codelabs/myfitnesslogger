import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";

interface CronometerLoginFormProps {
  onLogin: (username: string, password: string) => void;
  isLoading: boolean;
  error: string | null;
}

export const CronometerLoginForm = ({ onLogin, isLoading, error }: CronometerLoginFormProps) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    onLogin(username.trim(), password.trim());
  };

  return (
    <div className="max-w-md mx-auto px-0 sm:px-0">
      <div className="text-center mb-6 sm:mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2 sm:mb-3">Connect Cronometer</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed px-2">
          Sign in with your Cronometer account to view your last 7 days of food data.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
        <div className="rounded-xl border border-border bg-card p-4 sm:p-6 space-y-3.5 sm:space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Username or Email</label>
            <Input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your@email.com"
              required
              className="h-11"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Password</label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="pr-11 h-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>
        <Button
          type="submit"
          disabled={isLoading}
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
            "Connect & Load Data"
          )}
        </Button>
      </form>
    </div>
  );
};
