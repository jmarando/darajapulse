import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import logo from "@/assets/logo-pulse-mark.png";

const ticker = [
  { label: "Live campaigns", value: "27" },
  { label: "Views measured today", value: "4.8M" },
  { label: "Creators paid this week", value: "312" },
  { label: "Avg payout time", value: "9 min" },
];

const LandingEditorial = () => (
  <div className="min-h-screen bg-background text-foreground">
    <header className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between border-b border-border">
      <img src={logo} alt="Daraja Pulse" className="h-9 w-auto" />
      <nav className="hidden md:flex items-center gap-8 text-sm">
        <a className="hover:text-accent" href="#product">Product</a>
        <a className="hover:text-accent" href="#brands">For brands</a>
        <a className="hover:text-accent" href="#creators">For creators</a>
      </nav>
      <Link to="/auth"><Button variant="ghost" size="sm">Sign in <ArrowUpRight className="w-3.5 h-3.5 ml-1" /></Button></Link>
    </header>

    <section className="max-w-7xl mx-auto px-6 pt-16 pb-10 grid md:grid-cols-12 gap-8 items-end">
      <div className="md:col-span-8">
        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-6">Issue 01 · Nairobi</div>
        <h1 className="font-display text-[64px] md:text-[112px] leading-[0.92] font-semibold tracking-tight">
          The end of the<br />
          <span className="italic">PDF</span> <span className="text-accent italic">report.</span>
        </h1>
      </div>
      <div className="md:col-span-4 space-y-5">
        <p className="text-lg leading-snug text-muted-foreground">
          Daraja Pulse is the influence operating system for East African agencies. Brief, approve, publish, measure and pay — in one live document the brand can refresh at 2am.
        </p>
        <Link to="/auth"><Button size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground rounded-none px-6">Open the console <ArrowRight className="w-4 h-4 ml-2" /></Button></Link>
      </div>
    </section>

    <div className="border-y border-border bg-secondary/40">
      <div className="max-w-7xl mx-auto px-6 py-5 grid grid-cols-2 md:grid-cols-4 divide-x divide-border">
        {ticker.map(t => (
          <div key={t.label} className="px-6 first:pl-0">
            <div className="font-display text-3xl">{t.value}</div>
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground mt-1">{t.label}</div>
          </div>
        ))}
      </div>
    </div>

    <section className="max-w-7xl mx-auto px-6 py-20 grid md:grid-cols-12 gap-8">
      <div className="md:col-span-5">
        <div className="text-xs uppercase tracking-[0.3em] text-accent mb-4">Featured</div>
        <h2 className="font-display text-5xl leading-[1.05]">A campaign, narrated in real time.</h2>
        <p className="text-muted-foreground mt-4">Brand managers stop emailing for "the latest numbers". The link <em>is</em> the latest numbers.</p>
      </div>
      <div className="md:col-span-7">
        <div className="aspect-[4/3] rounded-md bg-gradient-ink text-primary-foreground p-8 flex flex-col justify-between shadow-elegant">
          <div className="flex items-center justify-between text-xs uppercase tracking-widest opacity-70">
            <span>Safaricom · Hustler Fund</span>
            <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" /> Live</span>
          </div>
          <div>
            <div className="font-display text-7xl">2.41<span className="text-accent">M</span></div>
            <div className="text-sm opacity-70 mt-1">views · 14 creators · day 6 of 14</div>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div><div className="text-2xl font-display">184k</div><div className="opacity-60 text-xs">likes</div></div>
            <div><div className="text-2xl font-display">9.2k</div><div className="opacity-60 text-xs">comments</div></div>
            <div><div className="text-2xl font-display">7.6%</div><div className="opacity-60 text-xs">eng. rate</div></div>
          </div>
        </div>
      </div>
    </section>

    <footer className="border-t border-border">
      <div className="max-w-7xl mx-auto px-6 py-8 flex justify-between text-xs text-muted-foreground">
        <span>© Daraja Pulse</span>
        <span>Nairobi · Kenya</span>
      </div>
    </footer>
  </div>
);
export default LandingEditorial;
