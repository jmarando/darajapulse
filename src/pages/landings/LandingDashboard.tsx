import { Link } from "react-router-dom";
import PublicFooter from "@/components/PublicFooter";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import {
  ArrowRight, Eye, Heart, MessageCircle, Share2, Sparkles, FileText,
  Users, Trophy, BarChart3, ShieldCheck, Zap, Globe, CheckCircle2, TrendingUp, Play
} from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis } from "recharts";
import logo from "@/assets/logo-pulse-mark.png";

const seed = Array.from({ length: 16 }, (_, i) => ({ x: i, v: 30 + Math.sin(i / 1.5) * 22 + i * 5 }));


const ticker = [
  "TikTok view captured · @wanjiruke · +12,408",
  "Content approved · Royco — Mama Mboga Q1",
  "Contest entry · #BoltKE — 38 submissions today",
  "Brief opened · NCBA Loop · 6 creators viewing",
  "Instagram Reels metrics synced · 21 posts",
  "Facebook Reel published · @sauticreates · live now",
  "YouTube Short tracked · @kenyanvibes · +4,210 views",
];

const LandingDashboard = () => {
  const [views, setViews] = useState(2_413_902);
  const [tickIdx, setTickIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setViews(v => v + Math.floor(20 + Math.random() * 80)), 1500);
    const tk = setInterval(() => setTickIdx(i => (i + 1) % ticker.length), 2400);
    return () => { clearInterval(t); clearInterval(tk); };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-paper overflow-hidden">
      {/* Ambient floating accents */}
      <div className="pointer-events-none fixed inset-0 -z-0">
        <div className="absolute top-[-10%] left-[-5%] w-[40rem] h-[40rem] rounded-full bg-accent/15 blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-15%] right-[-10%] w-[50rem] h-[50rem] rounded-full bg-highlight/10 blur-[140px]" style={{ animation: "pulse 6s ease-in-out infinite" }} />
      </div>

      <header className="relative max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
        <img src={logo} alt="Daraja Pulse" className="h-16 w-auto" />
        <div className="flex items-center gap-2">
          <Link to="/auth"><Button variant="ghost">Sign in</Button></Link>
          <Link to="/auth"><Button className="bg-primary">Start free</Button></Link>
        </div>
      </header>

      {/* HERO */}
      <section className="relative max-w-7xl mx-auto px-6 pt-12 pb-20 grid lg:grid-cols-[1.1fr_1fr] gap-12 items-center">
        <div className="animate-fade-in">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border text-[11px] uppercase tracking-[0.25em] text-foreground/70 mb-6 shadow-soft">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            Built for modern agencies
          </div>
          <h1 className="font-display text-6xl md:text-7xl lg:text-[5.5rem] leading-[0.98] font-semibold text-balance tracking-tight">
            Influence,<br />
            <span className="text-accent italic relative inline-block">
              orchestrated.
              <svg className="absolute -bottom-2 left-0 w-full" height="14" viewBox="0 0 300 14" fill="none">
                <path d="M2 8 Q 75 2, 150 7 T 298 6" stroke="hsl(0 99% 57%)" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.4" />
              </svg>
            </span>
          </h1>
          <p className="mt-7 text-lg md:text-xl text-muted-foreground max-w-xl leading-relaxed">
            Discover creators. Send briefs. Approve content. Track every post across <span className="text-foreground font-medium">TikTok, Instagram, Facebook, YouTube and X</span> in real time. Hand your client a live, self-refreshing report — not a stale PDF.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/auth"><Button size="lg" className="bg-primary text-base h-12 px-6 group">Open the console <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" /></Button></Link>
            <Dialog>
              <DialogTrigger asChild>
                <Button size="lg" variant="outline" className="h-12 px-6 group">
                  <Play className="w-4 h-4 mr-2 fill-current" /> Watch the 60s tour
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black border-0">
                <div className="aspect-video w-full">
                  <iframe
                    className="w-full h-full"
                    src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0"
                    title="Daraja Pulse — 60 second tour"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Live ticker */}
          <div className="mt-8 flex items-center gap-3 px-4 py-3 rounded-lg bg-card/70 border border-border max-w-xl backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse shrink-0" />
            <div className="text-xs text-muted-foreground font-mono truncate animate-fade-in" key={tickIdx}>
              {ticker[tickIdx]}
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-success" /> 5 platforms, one inbox</div>
            <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-success" /> Live tokenized reports</div>
            <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-success" /> Built for Kenyan agencies</div>
          </div>
        </div>

        {/* Live report mock */}
        <div className="relative animate-fade-in">
          <div className="absolute -inset-8 bg-gradient-warm opacity-25 blur-3xl rounded-full" />

          {/* Floating mini-cards */}
          <div className="absolute -top-6 -left-6 z-20 px-3 py-2 rounded-lg bg-card border border-border shadow-elegant flex items-center gap-2 text-xs" style={{ animation: "fade-in 0.6s ease-out, float 4s ease-in-out 0.6s infinite" }}>
            <CheckCircle2 className="w-4 h-4 text-success" />
            <div>
              <div className="font-semibold">Content approved</div>
              <div className="text-[10px] text-muted-foreground">Round 2 · 1m ago</div>
            </div>
          </div>
          <div className="absolute -bottom-4 -right-4 z-20 px-3 py-2 rounded-lg bg-card border border-border shadow-elegant flex items-center gap-2 text-xs" style={{ animation: "float 5s ease-in-out infinite" }}>
            <Trophy className="w-4 h-4 text-highlight" />
            <div>
              <div className="font-semibold">38 contest entries</div>
              <div className="text-[10px] text-muted-foreground">#BoltKE · today</div>
            </div>
          </div>

          <div className="relative rounded-2xl bg-card border border-border shadow-elegant overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between text-xs">
              <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" /> Live · Hustler Fund</div>
              <div className="text-muted-foreground">updated just now</div>
            </div>
            <div className="p-6">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Total views</div>
              <div className="font-display text-5xl mt-1 tabular-nums">{views.toLocaleString()}</div>
              <div className="h-28 mt-4 -mx-2">
                <ResponsiveContainer>
                  <AreaChart data={seed}>
                    <defs>
                      <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="hsl(0 99% 57%)" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="hsl(0 99% 57%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="x" hide />
                    <Area type="monotone" dataKey="v" stroke="hsl(0 99% 57%)" strokeWidth={2.5} fill="url(#g)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-4 gap-3 mt-4">
                {[
                  { i: Eye, l: "Views", v: "2.4M" },
                  { i: Heart, l: "Likes", v: "184k" },
                  { i: MessageCircle, l: "Comments", v: "9.2k" },
                  { i: Share2, l: "Shares", v: "21k" },
                ].map(({ i: I, l, v }) => (
                  <div key={l} className="rounded-lg bg-secondary/60 p-3 hover:bg-secondary transition-colors">
                    <I className="w-3.5 h-3.5 text-muted-foreground" />
                    <div className="font-display text-lg mt-1">{v}</div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{l}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-5 py-3 bg-secondary/40 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>14 creators · 21 posts</span>
              <span className="font-mono">daraja.pulse/r/h7s2k</span>
            </div>
          </div>
        </div>
      </section>

      {/* USP STRIP */}
      <section className="relative border-y border-border bg-card/40 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { n: "5", l: "Platforms unified" },
            { n: "<5 min", l: "From brief to live" },
            { n: "Live", l: "Client reports" },
            { n: "0", l: "Spreadsheets" },
          ].map(s => (
            <div key={s.l} className="text-center md:text-left">
              <div className="font-display text-3xl md:text-4xl font-semibold text-accent">{s.n}</div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground mt-1">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* USP DEEP DIVE */}
      <section className="relative max-w-7xl mx-auto px-6 py-24">
        <div className="text-xs uppercase tracking-[0.3em] text-accent mb-3">Why Daraja Pulse</div>
        <h2 className="font-display text-4xl md:text-6xl font-semibold max-w-3xl leading-[1.05] mb-16">
          Everything between the brief and the report — <span className="italic text-muted-foreground">finally in one place.</span>
        </h2>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            { i: Users, t: "Creator roster & discovery", b: "TikTok-first database with audience authenticity, niche, language and Kenya-vs-diaspora splits. Build a list in minutes, not weeks." },
            { i: FileText, t: "Tokenized creator briefs", b: "Send a single link. Creators see the deliverables, deadlines and scope — no logins, no chasing on WhatsApp." },
            { i: CheckCircle2, t: "Two-round content approvals", b: "Threaded comments per asset. Brand and account manager align before a single post goes live." },
            { i: BarChart3, t: "Live, self-refreshing reports", b: "A tokenized client URL that updates every few minutes. Brand managers actually forward this internally." },
            { i: Trophy, t: "UGC contests & leaderboards", b: "Public submission links, auto-leaderboards and entry tracking. Turn fans into your next campaign roster." },
            { i: ShieldCheck, t: "Brand portal access", b: "Invite client-side stakeholders to a read-only portal. They see only their campaigns — never your fees or other accounts." },
            { i: Sparkles, t: "AI campaign learnings", b: "Auto-generated insights on what worked, who outperformed and what to repeat next quarter. Powered by Lovable AI." },
            { i: Globe, t: "Five-platform tracking", b: "Native OAuth + polling for TikTok. Embeds and metrics for Instagram, Facebook, YouTube and X. One dashboard, every channel." },
            { i: TrendingUp, t: "Earned media valuation", b: "Every view, like and share priced against a CPM benchmark — so you can show the brand the ROI in shillings, not vibes." },
          ].map(({ i: I, t, b }) => (
            <div key={t} className="group relative p-6 rounded-xl bg-card border border-border hover:border-accent/40 hover:shadow-elegant hover:-translate-y-1 transition-all duration-300">
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center mb-4 group-hover:bg-accent group-hover:text-accent-foreground transition-colors">
                <I className="w-5 h-5 text-accent group-hover:text-accent-foreground transition-colors" />
              </div>
              <h3 className="font-display text-xl mb-2">{t}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* WORKFLOW */}
      <section className="relative bg-primary text-primary-foreground py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-xs uppercase tracking-[0.3em] text-accent mb-3">The flow</div>
          <h2 className="font-display text-4xl md:text-6xl font-semibold max-w-3xl leading-[1.05] mb-16">
            From brief to report — <span className="italic opacity-70">in one continuous motion.</span>
          </h2>
          <div className="grid md:grid-cols-5 gap-4">
            {[
              { n: "01", t: "Discover", d: "Build a creator shortlist" },
              { n: "02", t: "Brief", d: "Tokenized link to creators" },
              { n: "03", t: "Approve", d: "Round 1 + 2 with comments" },
              { n: "04", t: "Publish", d: "Auto-tracked across platforms" },
              { n: "05", t: "Report", d: "Live URL for the brand" },
            ].map((s, i) => (
              <div key={s.n} className="relative p-5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                <div className="text-accent font-mono text-xs">{s.n}</div>
                <div className="font-display text-2xl mt-2">{s.t}</div>
                <div className="text-sm opacity-60 mt-1">{s.d}</div>
                {i < 4 && <ArrowRight className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-accent z-10 bg-primary rounded-full p-0.5" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CLOSING CTA */}
      <section className="relative max-w-5xl mx-auto px-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 text-accent text-[11px] uppercase tracking-[0.25em] mb-6">
          <Zap className="w-3 h-3" /> Built for Kenyan agencies
        </div>
        <h2 className="font-display text-5xl md:text-7xl font-semibold leading-[1.02] text-balance">
          Stop losing nights<br />
          <span className="italic text-accent">to spreadsheets.</span>
        </h2>
        <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto">
          Spin up your first campaign today. No credit card. No 30-day demo dance.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link to="/auth"><Button size="lg" className="bg-primary text-base h-12 px-8 group">Start free <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" /></Button></Link>
        </div>
        <div className="mt-10 flex justify-center items-center gap-2 text-xs text-muted-foreground">
          <TrendingUp className="w-3.5 h-3.5 text-success" /> Trusted by agencies running campaigns across East Africa
        </div>
      </section>

      <PublicFooter />
    </div>
  );
};

export default LandingDashboard;
