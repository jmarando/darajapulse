import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Send, UploadCloud } from "lucide-react";
import { toast } from "sonner";

export type CreatorDraftState = {
  required?: boolean;
  approved_available?: boolean;
  drafts?: { status: string; review_note: string | null }[];
};

/** Where the creator stands, because the button in the decision email lands them on the brief. */
const whereYouStand = ({ approved_available, drafts }: CreatorDraftState): string | null => {
  if (approved_available) return "Your video is approved. Post it, then send us the live link.";
  const latest = drafts?.[0];
  if (latest?.status === "pending") return "Your video is with the team. Once it's approved you can post it and send us the link.";
  if (latest?.status === "changes_requested") return latest.review_note ? `Changes needed: ${latest.review_note}` : "Changes needed on your video.";
  return null;
};

/** The brief's way in on a campaign that wants each video approved before it goes live. */
const BriefSubmitSteps = ({
  submitUrl,
  locked,
  deliverables,
  state,
}: {
  /** The creator's personal page, /c/<token>?k=<brief>. Null when the campaign has no submission link yet. */
  submitUrl: string | null;
  locked: boolean;
  deliverables: number;
  state: CreatorDraftState;
}) => {
  const note = whereYouStand(state);
  const approved = !!state.approved_available;
  const fullUrl = `${window.location.origin}${submitUrl}`;
  const accent = "bg-accent text-accent-foreground hover:bg-accent/90";

  return (
    <Card className={`p-6 mt-6 border-accent/40 bg-accent/5 ${locked ? "opacity-60" : ""}`}>
      <div className="text-[10px] uppercase tracking-widest text-accent">Your next steps</div>
      <h3 className="font-display text-xl mt-1">Get your video approved, then send us the link</h3>
      <ol className="mt-3 space-y-3 text-sm">
        <li>
          <div className="font-medium">1. Upload your video</div>
          <p className="text-muted-foreground mt-0.5">Upload the finished MP4 before you post it. The team approves it or sends notes back.</p>
        </li>
        <li>
          <div className="font-medium">2. Post it and send us the link</div>
          <p className="text-muted-foreground mt-0.5">
            Once it's approved, post it and paste the live link on your personal page. This is how we track your views
            and engagement, and how your work counts towards your {deliverables} deliverable{deliverables === 1 ? "" : "s"}.
          </p>
        </li>
      </ol>
      {locked ? (
        <p className="text-sm text-accent mt-4 font-medium">Sign the agreement above to unlock your upload and post links.</p>
      ) : !submitUrl ? (
        <p className="text-sm text-accent mt-4 font-medium">Your upload link isn't ready yet. Please ask the team to switch it on.</p>
      ) : (
        <>
          {note && <p className="text-sm mt-4 rounded-md border border-border bg-card p-3">{note}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button asChild variant={approved ? "outline" : "default"} className={approved ? "" : accent}>
              <a href={`${submitUrl}&step=1`} target="_blank" rel="noreferrer"><UploadCloud className="w-4 h-4 mr-2" /> Upload my video</a>
            </Button>
            <Button asChild variant={approved ? "default" : "outline"} className={approved ? accent : ""}>
              <a href={`${submitUrl}&step=2`} target="_blank" rel="noreferrer"><Send className="w-4 h-4 mr-2" /> Send my post link</a>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(fullUrl);
                toast.success("Your personal link is copied — save it for later");
              }}
            >
              <Copy className="w-4 h-4 mr-2" /> Copy my link
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-3 break-all">Bookmark it: {fullUrl}</p>
        </>
      )}
    </Card>
  );
};

export default BriefSubmitSteps;
