import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, BarChart3, Wallet, Users, Sparkles } from "lucide-react";

const Landing = () => (
  <div className="min-h-screen bg-gradient-paper">
    <header className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-md bg-gradient-warm" />
        <span className="font-display text-xl font-semibold">Daraja Pulse</span>
      </div>
      <Link to="/auth"><Button variant="ghost">Sign in</Button></Link>
    </header>
    <section className="max-w-5xl mx-auto px-6 pt-16 pb-24 text-center">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-xs uppercase tracking-widest text-muted-foreground mb-6">
        <Sparkles className="w-3 h-3 text-accent" /> Influence operating system · Kenya
      </div>
      <h1 className="font-display text-5xl md:text-7xl font-semibold leading-[1.05] text-balance">
        Run influencer campaigns the way <span className="italic text-accent">brands</span> already wish you did.
      </h1>
      <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto text-balance">
        Discover, brief, approve, publish, measure and pay — across TikTok, Instagram, YouTube and X. M-Pesa native. KRA aware. Built for Daraja Pulse and the brands you serve.
      </p>
      <div className="mt-8 flex items-center justify-center gap-3">
        <Link to="/auth"><Button size="lg" className="bg-primary">Open the console <ArrowRight className="w-4 h-4 ml-2" /></Button></Link>
      </div>
    </section>
    <section className="max-w-6xl mx-auto px-6 pb-24 grid md:grid-cols-3 gap-6">
      {[
        { icon: Users, title: "Roster & discovery", body: "TikTok-first influencer database with audience authenticity, niche, language, and Kenya-vs-diaspora splits." },
        { icon: BarChart3, title: "The live client report", body: "A tokenized, embed-grade page brand managers actually forward internally. Updated every few minutes." },
        { icon: Wallet, title: "M-Pesa payouts", body: "Pay creators in minutes, not 30 days. WHT and e-TIMS handled, the way KRA wants." },
      ].map(({ icon: Icon, title, body }) => (
        <div key={title} className="p-6 rounded-xl bg-card border border-border shadow-soft">
          <Icon className="w-6 h-6 text-accent" />
          <h3 className="font-display text-xl mt-4">{title}</h3>
          <p className="text-sm text-muted-foreground mt-2">{body}</p>
        </div>
      ))}
    </section>
  </div>
);

export default Landing;
