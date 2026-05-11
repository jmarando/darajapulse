const PublicFooter = () => (
  <footer className="border-t mt-12">
    <div className="max-w-5xl mx-auto px-6 md:px-10 py-8 grid gap-6 md:grid-cols-3 text-sm">
      <div>
        <div className="font-display text-base font-semibold">glab.africa</div>
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
          Influencer marketing & creator campaigns across East Africa.
        </p>
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Contact</div>
        <ul className="space-y-1">
          <li><a href="mailto:hello@glab.africa" className="hover:underline">hello@glab.africa</a></li>
          <li><a href="https://wa.me/254700000000" target="_blank" rel="noreferrer" className="hover:underline">WhatsApp</a></li>
          <li className="text-muted-foreground">Nairobi, Kenya</li>
        </ul>
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Legal</div>
        <ul className="space-y-1">
          <li><a href="/terms" className="hover:underline">Terms of Service</a></li>
          <li><a href="/privacy" className="hover:underline">Privacy Policy</a></li>
          <li className="text-muted-foreground">© {new Date().getFullYear()} glab.africa</li>
        </ul>
      </div>
    </div>
  </footer>
);

export default PublicFooter;
