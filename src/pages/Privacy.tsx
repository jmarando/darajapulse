const Privacy = () => (
  <div className="min-h-screen bg-background">
    <div className="max-w-3xl mx-auto px-6 md:px-10 py-12">
      <a href="/" className="text-sm text-muted-foreground hover:text-foreground">← Home</a>
      <h1 className="font-display text-4xl font-semibold mt-4 mb-2">Privacy Policy</h1>
      <p className="text-muted-foreground text-sm">Last updated {new Date().toLocaleDateString()}</p>
      <div className="prose prose-sm max-w-none mt-8 space-y-4 text-sm leading-relaxed">
        <p>glab.africa ("we", "us") respects your privacy. This policy explains what we collect and how we use it.</p>
        <h2 className="font-semibold text-base mt-6">1. Information we collect</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Account information (name, email) for agency and brand users.</li>
          <li>Creator information you add to the roster (handle, platform, contact, fee).</li>
          <li>Public social-media metrics retrieved from third-party platforms (e.g. TikTok, Instagram).</li>
          <li>Usage analytics to improve the platform.</li>
        </ul>
        <h2 className="font-semibold text-base mt-6">2. How we use it</h2>
        <p>To run campaigns, share reports and plans with brands, pay creators, and improve the Service.</p>
        <h2 className="font-semibold text-base mt-6">3. Sharing</h2>
        <p>We do not sell personal data. Campaign data is shared only with the contracting brand and the relevant creators, or via tokenized public links you generate.</p>
        <h2 className="font-semibold text-base mt-6">4. Your rights</h2>
        <p>You can request access, correction or deletion of your data by emailing <a className="underline" href="mailto:privacy@glab.africa">privacy@glab.africa</a>.</p>
        <h2 className="font-semibold text-base mt-6">5. Contact</h2>
        <p><a className="underline" href="mailto:hello@glab.africa">hello@glab.africa</a></p>
      </div>
    </div>
  </div>
);
export default Privacy;
