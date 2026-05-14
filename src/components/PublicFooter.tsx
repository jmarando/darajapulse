import { Link } from "react-router-dom";

const PublicFooter = () => (
  <footer className="border-t border-border bg-background">
    <div className="max-w-7xl mx-auto px-6 md:px-10 py-12 grid gap-10 md:grid-cols-12 text-sm">
      <div className="md:col-span-5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-accent" />
          <span className="font-display text-base font-semibold tracking-tight">Daraja Pulse</span>
        </div>
        <p className="font-display italic text-muted-foreground mt-3 text-sm">Influence, measured.</p>
        <p className="text-muted-foreground mt-3 text-xs leading-relaxed max-w-sm">
          Brief, publish, measure & pay creators across TikTok, Instagram, YouTube & X. Built in Nairobi.
        </p>
      </div>

      <div className="md:col-span-3">
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground mb-3">Product</div>
        <ul className="space-y-2">
          <li><Link to="/auth" className="hover:text-accent transition-colors">Sign in</Link></li>
          <li><Link to="/auth" className="hover:text-accent transition-colors">Get started</Link></li>
          <li><Link to="/landing" className="hover:text-accent transition-colors">Explore</Link></li>
        </ul>
      </div>

      <div className="md:col-span-2">
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground mb-3">Contact</div>
        <ul className="space-y-2">
          <li><a href="mailto:hello@darajapulse.com" className="hover:text-accent transition-colors">hello@darajapulse.com</a></li>
          <li className="text-muted-foreground">Nairobi, Kenya</li>
        </ul>
      </div>

      <div className="md:col-span-2">
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground mb-3">Legal</div>
        <ul className="space-y-2">
          <li><Link to="/terms" className="hover:text-accent transition-colors">Terms of Service</Link></li>
          <li><Link to="/privacy" className="hover:text-accent transition-colors">Privacy Policy</Link></li>
        </ul>
      </div>
    </div>
    <div className="border-t border-border">
      <div className="max-w-7xl mx-auto px-6 md:px-10 py-5 flex flex-col md:flex-row justify-between gap-2 text-xs text-muted-foreground">
        <span>© {new Date().getFullYear()} Daraja Pulse. All rights reserved.</span>
        <span className="flex items-center gap-4">
          <Link to="/terms" className="hover:text-accent transition-colors">Terms</Link>
          <Link to="/privacy" className="hover:text-accent transition-colors">Privacy</Link>
        </span>
      </div>
    </div>
  </footer>
);

export default PublicFooter;
