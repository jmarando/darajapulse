import { Link } from "react-router-dom";
import logo from "@/assets/logo-pulse-mark.png";

const opts = [
  { to: "/landing/editorial", label: "A · Editorial magazine", desc: "Huge serif headline, red accent, ticker of live stats. NYT T Magazine vibe." },
  { to: "/landing/cinematic", label: "B · Dark cinematic", desc: "Near-black bg, glowing red pulse, kinetic headline, neon stat cards." },
  { to: "/landing/dashboard", label: "C · Live dashboard preview", desc: "Split hero with a real, ticking report card on the right." },
  { to: "/landing/bento", label: "D · Bento showcase", desc: "Modular grid: headline, M-Pesa, live metric, creators, KRA, all visible." },
];

const LandingPicker = () => (
  <div className="min-h-screen bg-gradient-paper p-10">
    <img src={logo} alt="Daraja Pulse" className="h-10 w-auto mb-10" />
    <h1 className="font-display text-4xl mb-2">Homepage mocks</h1>
    <p className="text-muted-foreground mb-8">Click each to preview. Tell me which to ship as the new <code>/</code>.</p>
    <div className="grid md:grid-cols-2 gap-4 max-w-4xl">
      {opts.map(o => (
        <Link key={o.to} to={o.to} className="block p-6 rounded-xl bg-card border border-border hover:border-accent transition-colors shadow-soft">
          <div className="font-display text-xl">{o.label}</div>
          <div className="text-sm text-muted-foreground mt-2">{o.desc}</div>
        </Link>
      ))}
    </div>
  </div>
);
export default LandingPicker;
