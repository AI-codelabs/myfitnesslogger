import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AppleHealthShortcutCard } from "@/components/AppleHealthShortcutCard";
import { Lang } from "@/lib/onboardingSchema";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lang: Lang;
  onTokenUsed?: () => void;
}

export function AppleHealthShortcutDialog({ open, onOpenChange, lang, onTokenUsed }: Props) {
  const t = (nl: string, en: string) => (lang === "nl" ? nl : en);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-5 sm:px-6 pt-5 pb-3 border-b">
          <DialogTitle>{t("Apple Health Shortcut testen", "Test Apple Health Shortcut")}</DialogTitle>
          <DialogDescription>
            {t(
              "Installeer de Shortcut, maak een token aan en test de sync naast de bestaande Cronometer-koppeling.",
              "Install the Shortcut, create a token, and test sync alongside the existing Cronometer connection.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="p-4 sm:p-5">
          <AppleHealthShortcutCard lang={lang} onTokenUsed={onTokenUsed} variant="panel" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
