const Terms = () => (
  <div className="min-h-screen bg-background">
    <div className="max-w-3xl mx-auto px-6 md:px-10 py-12">
      <a href="/" className="text-sm text-muted-foreground hover:text-foreground">← Home</a>
      <h1 className="font-display text-4xl font-semibold mt-4 mb-2">Terms of Service</h1>
      <p className="text-muted-foreground text-sm">Last updated {new Date().toLocaleDateString()}</p>
      <div className="prose prose-sm max-w-none mt-8 space-y-4 text-sm leading-relaxed">
        <p>These Terms of Service ("Terms") govern your access to and use of the glab.africa platform, websites, and shared campaign pages (collectively, the "Service"). By accessing the Service you agree to these Terms.</p>
        <h2 className="font-semibold text-base mt-6">1. Use of the Service</h2>
        <p>You agree to use the Service only for lawful purposes and in accordance with any campaign briefs, contracts, or written agreements between you and glab.africa.</p>
        <h2 className="font-semibold text-base mt-6">2. Confidentiality</h2>
        <p>Campaign plans, briefs, fees and creator details shared through tokenized links are confidential. Do not redistribute outside your organization.</p>
        <h2 className="font-semibold text-base mt-6">3. Intellectual Property</h2>
        <p>All content created by creators in connection with a campaign is licensed to the brand per the terms of the individual creator brief. The Service interface and underlying code remain the property of glab.africa.</p>
        <h2 className="font-semibold text-base mt-6">4. Disclaimer</h2>
        <p>The Service is provided "as is". Reach, engagement and audience metrics are reported by third-party platforms and may change without notice.</p>
        <h2 className="font-semibold text-base mt-6">5. Contact</h2>
        <p>Questions: <a className="underline" href="mailto:hello@glab.africa">hello@glab.africa</a>.</p>
      </div>
    </div>
  </div>
);
export default Terms;
