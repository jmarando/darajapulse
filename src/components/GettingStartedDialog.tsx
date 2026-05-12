import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BarChart3, FileSignature, MessageSquare, Sparkles } from "lucide-react";

const STORAGE_KEY = "portal_tour_seen_v1";

const steps = [
  {
    icon: Sparkles,
    title: "Welcome to your brand portal",
    body: "This is your home for live campaign performance, briefs, and content approvals — all in one place.",
  },
  {
    icon: BarChart3,
    title: "Reading your metrics",
    body: "Views, Reach and Impressions show how many people saw the content. Engagement (likes + comments + shares + saves ÷ views) shows how strongly they reacted. EMV is the earned media value vs. paid media at a KES 12 CPM benchmark.",
  },
  {
    icon: FileSignature,
    title: "Where to find briefs & content",
    body: "Open any campaign to see the brief, creator roster, scheduled content and live posts. You can comment directly on content drafts to request changes.",
  },
  {
    icon: MessageSquare,
    title: "Need help?",
    body: "Email hello@glab.africa anytime. You can re-open this guide from the Help button in your portal header.",
  },
];

interface Props {
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  forceShow?: boolean;
}

const GettingStartedDialog = ({ open: controlledOpen, onOpenChange, forceShow }: Props) => {
  const [open, setOpen] = useState<boolean>(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (controlledOpen !== undefined) { setOpen(controlledOpen); return; }
    if (forceShow) { setOpen(true); return; }
    if (typeof window !== "undefined" && !localStorage.getItem(STORAGE_KEY)) {
      setOpen(true);
    }
  }, [controlledOpen, forceShow]);

  const close = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
    onOpenChange?.(false);
  };

  const S = steps[step];
  const Icon = S.icon;
  const last = step === steps.length - 1;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="w-11 h-11 rounded-md bg-accent/15 text-accent flex items-center justify-center mb-2">
            <Icon className="w-5 h-5" />
          </div>
          <DialogTitle className="font-display text-2xl">{S.title}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed pt-1">{S.body}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-center gap-1.5 py-2">
          {steps.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-accent" : "w-1.5 bg-muted"}`} />
          ))}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={close}>Skip</Button>
          {!last ? (
            <Button onClick={() => setStep(step + 1)}>Next</Button>
          ) : (
            <Button onClick={close}>Get started</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GettingStartedDialog;
