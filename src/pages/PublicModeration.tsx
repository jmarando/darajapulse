import { useParams } from "react-router-dom";
import Moderation from "./app/Moderation";

const PublicModeration = () => {
  const { token } = useParams();
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur">
        <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/favicon.png" alt="Daraja Pulse" className="w-6 h-6" />
            <span className="font-display text-sm">Daraja Pulse · Shared moderation view</span>
          </div>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Read-only · token {token?.slice(0, 6)}…</span>
        </div>
      </header>
      <Moderation readOnly />
    </div>
  );
};

export default PublicModeration;
