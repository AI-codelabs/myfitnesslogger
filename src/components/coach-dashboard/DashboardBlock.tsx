import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  iconBg: string;
  iconColor: string;
  loading?: boolean;
  children: ReactNode;
  className?: string;
}

export function DashboardBlock({
  title,
  subtitle,
  icon,
  iconBg,
  iconColor,
  loading,
  children,
  className,
}: Props) {
  return (
    <Card className={cn("flex flex-col overflow-hidden", className)}>
      <div className="px-4 sm:px-5 py-3.5 border-b flex items-center gap-3">
        <div
          className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
            iconBg,
          )}
        >
          <span className={iconColor}>{icon}</span>
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold leading-tight truncate">{title}</h2>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <div className="flex-1">
        {loading ? (
          <div className="h-full flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          children
        )}
      </div>
    </Card>
  );
}

export function DashboardEmpty({ text }: { text: string }) {
  return (
    <div className="px-5 py-5 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
