import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AuthFormProps {
  onAuth: (email: string, password: string, isSignUp: boolean) => Promise<{ error: any }>;
  isLoading: boolean;
}

export const AuthForm = ({ onAuth, isLoading }: AuthFormProps) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const { error } = await onAuth(email, password, isSignUp);
    if (error) setError(error.message);
  };

  return (
    <div className="max-w-sm mx-auto">
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-2xl gradient-brand flex items-center justify-center mx-auto mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" /><line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight mb-1">MFP Connect</h1>
        <p className="text-muted-foreground text-sm">
          {isSignUp ? "Create an account to get started" : "Sign in to your account"}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Password</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>
        <Button type="submit" disabled={isLoading} className="w-full h-11 gradient-brand border-0 font-semibold">
          {isLoading ? "Please wait..." : isSignUp ? "Create Account" : "Sign In"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <button type="button" onClick={() => { setIsSignUp(!isSignUp); setError(null); }} className="text-primary font-medium hover:underline">
            {isSignUp ? "Sign in" : "Sign up"}
          </button>
        </p>
      </form>
    </div>
  );
};
