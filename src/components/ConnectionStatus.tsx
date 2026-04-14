interface ConnectionStatusProps {
  connected: boolean;
}

export const ConnectionStatus = ({ connected }: ConnectionStatusProps) => {
  return (
    <div className="flex items-center gap-2 text-sm">
      <div
        className={`w-2 h-2 rounded-full ${
          connected ? "bg-primary animate-pulse" : "bg-muted-foreground/40"
        }`}
      />
      <span className="text-muted-foreground">
        {connected ? "Connected" : "Not connected"}
      </span>
    </div>
  );
};
