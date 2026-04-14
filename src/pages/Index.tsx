import { useState } from "react";
import { ConnectForm } from "@/components/ConnectForm";
import { FoodLogTable } from "@/components/FoodLogTable";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import type { FoodLogData } from "@/types/mfp";

const Index = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [foodLog, setFoodLog] = useState<FoodLogData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async (cookies: string, date?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/mfp-fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookies, date }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setFoodLog(data);
        setIsConnected(true);
      }
    } catch {
      setError("Failed to fetch data. Please check your cookies and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/60">
        <div className="container mx-auto px-6 py-5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg gradient-brand flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" /><line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">MyFitnessPal Connect</h1>
          <div className="ml-auto">
            <ConnectionStatus connected={isConnected} />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-10 max-w-5xl">
        {!isConnected ? (
          <div className="max-w-lg mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold tracking-tight mb-3">
                Connect Your Account
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Paste your MyFitnessPal session cookies to pull in your food diary.
                Your cookies are only used for this request and never stored.
              </p>
            </div>
            <ConnectForm onConnect={handleConnect} isLoading={isLoading} error={error} />
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Your Food Log</h2>
                {foodLog && (
                  <p className="text-muted-foreground mt-1">
                    {foodLog.date} &middot; {foodLog.totals.calories} calories
                  </p>
                )}
              </div>
              <button
                onClick={() => { setIsConnected(false); setFoodLog(null); }}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Disconnect
              </button>
            </div>
            {foodLog && <FoodLogTable data={foodLog} />}
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
