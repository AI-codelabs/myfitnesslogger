import { useState } from "react";
import { CronometerLoginForm } from "@/components/CronometerLoginForm";
import { FoodLogTable } from "@/components/FoodLogTable";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { loginAndExport } from "@/lib/cronometer";
import type { DayLog } from "@/types/cronometer";

const Index = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [days, setDays] = useState<DayLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (username: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await loginAndExport(username, password);
      if (result.error) {
        setError(result.error);
      } else if (result.days) {
        setDays(result.days);
        setIsConnected(true);
      }
    } catch {
      setError("Connection failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    setDays([]);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60">
        <div className="container mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg gradient-brand flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" /><line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Cronometer Connect</h1>
          <div className="ml-auto flex items-center gap-4">
            <ConnectionStatus connected={isConnected} />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-10 max-w-5xl">
        {!isConnected ? (
          <CronometerLoginForm onLogin={handleLogin} isLoading={isLoading} error={error} />
        ) : (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Your Food Log</h2>
                <p className="text-muted-foreground mt-1">
                  Last 7 days &middot; {days.length} days loaded
                </p>
              </div>
              <button
                onClick={handleDisconnect}
                className="text-sm text-muted-foreground hover:text-destructive transition-colors"
              >
                Disconnect
              </button>
            </div>

            {days.length > 0 ? (
              <FoodLogTable days={days} />
            ) : (
              <div className="text-center py-20 text-muted-foreground">
                No food data found for the last 7 days.
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
