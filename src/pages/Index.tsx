import { useState, useEffect, useCallback } from "react";
import { MfpLoginForm } from "@/components/MfpLoginForm";
import { FoodLogTable } from "@/components/FoodLogTable";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { loginToMfp, fetchFoodLog } from "@/lib/mfp";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { FoodLogData } from "@/types/mfp";

const COOKIES_KEY = "mfp_cookies";
const USERNAME_KEY = "mfp_username";

const Index = () => {
  const [mfpConnected, setMfpConnected] = useState(false);
  const [mfpCookies, setMfpCookies] = useState<string | null>(null);
  const [mfpUsername, setMfpUsername] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [foodLog, setFoodLog] = useState<FoodLogData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);

  // Restore saved session
  useEffect(() => {
    const saved = localStorage.getItem(COOKIES_KEY);
    const savedUser = localStorage.getItem(USERNAME_KEY);
    if (saved) {
      setMfpCookies(saved);
      setMfpUsername(savedUser);
      setMfpConnected(true);
    }
  }, []);

  const loadFoodLog = useCallback(async (cookies: string, date: string) => {
    setIsFetching(true);
    setError(null);
    try {
      const data = await fetchFoodLog(cookies, date);
      if (data.error) {
        setError(data.error);
      } else {
        setFoodLog(data);
      }
    } catch {
      setError("Failed to fetch food log. Your session may have expired.");
    } finally {
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    if (mfpConnected && mfpCookies) {
      loadFoodLog(mfpCookies, selectedDate);
    }
  }, [mfpConnected, mfpCookies, selectedDate, loadFoodLog]);

  const handleMfpLogin = async (email: string, password: string) => {
    setIsConnecting(true);
    setError(null);
    try {
      const result = await loginToMfp(email, password);
      if (result.error) {
        setError(result.error);
      } else if (result.cookies) {
        setMfpCookies(result.cookies);
        setMfpUsername(result.username || email);
        setMfpConnected(true);
        localStorage.setItem(COOKIES_KEY, result.cookies);
        localStorage.setItem(USERNAME_KEY, result.username || email);
      }
    } catch {
      setError("Connection failed. Please try again.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    localStorage.removeItem(COOKIES_KEY);
    localStorage.removeItem(USERNAME_KEY);
    setMfpConnected(false);
    setMfpCookies(null);
    setMfpUsername(null);
    setFoodLog(null);
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
          <h1 className="text-xl font-semibold tracking-tight">MFP Connect</h1>
          <div className="ml-auto flex items-center gap-4">
            <ConnectionStatus connected={mfpConnected} />
            {mfpUsername && (
              <span className="text-sm text-muted-foreground hidden sm:inline">{mfpUsername}</span>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-10 max-w-5xl">
        {!mfpConnected ? (
          <MfpLoginForm onLogin={handleMfpLogin} isLoading={isConnecting} error={error} />
        ) : (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Your Food Log</h2>
                {foodLog && (
                  <p className="text-muted-foreground mt-1">
                    {foodLog.date} &middot; {foodLog.totals.calories} calories
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-auto" />
                <Button variant="outline" size="sm" onClick={() => mfpCookies && loadFoodLog(mfpCookies, selectedDate)} disabled={isFetching}>
                  {isFetching ? "Loading..." : "Refresh"}
                </Button>
                <button onClick={handleDisconnect} className="text-sm text-muted-foreground hover:text-destructive transition-colors">
                  Disconnect
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive mb-6">{error}</div>
            )}

            {isFetching && !foodLog ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
              </div>
            ) : foodLog ? (
              <FoodLogTable data={foodLog} />
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
