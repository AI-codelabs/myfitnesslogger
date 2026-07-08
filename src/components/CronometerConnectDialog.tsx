import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";
import type { Lang } from "@/lib/onboardingSchema";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lang?: Lang;
  onConnected?: () => void;
}

const copy = {
  nl: {
    title: "Verbind je Cronometer-account",
    desc:
      "Je coach verstuurt een uitnodiging via Cronometer naar je e-mailadres. Controleer je inbox (en spamfolder) en klik op de link om de koppeling te accepteren.",
    step1: "Wacht op de uitnodigingsmail van Cronometer.",
    step2: "Open de mail en accepteer de coach-verbinding.",
    step3: "Kom terug hier en je voeding wordt automatisch gesynchroniseerd.",
    close: "Sluiten",
  },
  en: {
    title: "Connect your Cronometer account",
    desc:
      "Your coach will send an invite from Cronometer to your email address. Check your inbox (and spam folder) and click the link to accept.",
    step1: "Wait for the invitation email from Cronometer.",
    step2: "Open the email and accept the coach connection.",
    step3: "Come back here — your nutrition data will sync automatically.",
    close: "Close",
  },
};

export const CronometerConnectDialog = ({ open, onOpenChange, lang = "nl" }: Props) => {
  const c = copy[lang];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {c.title}
          </DialogTitle>
          <DialogDescription>{c.desc}</DialogDescription>
        </DialogHeader>
        <ol className="list-decimal list-inside space-y-2 text-sm pl-1">
          <li>{c.step1}</li>
          <li>{c.step2}</li>
          <li>{c.step3}</li>
        </ol>
        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{c.close}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
