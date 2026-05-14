import PublicFooter from "@/components/PublicFooter";

const Privacy = () => (
  <div className="min-h-screen bg-background flex flex-col">
    <div className="flex-1">
      <div className="max-w-3xl mx-auto px-6 md:px-10 py-12">
        <a href="/" className="text-sm text-muted-foreground hover:text-foreground">← Home</a>
        <h1 className="font-display text-4xl font-semibold mt-4 mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground text-sm">Last updated {new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })}</p>
        <div className="prose prose-sm max-w-none mt-8 space-y-4 text-sm leading-relaxed">
          <p>Daraja Pulse ("we", "us") respects your privacy. This policy explains what we collect, how we use it, and the choices you have.</p>

          <h2 className="font-semibold text-base mt-6">1. Information we collect</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Account information (name, email, role) for agency, brand, and creator users.</li>
            <li>Creator information you add to your roster (handle, platform, contact, fee, payout details).</li>
            <li>Campaign data: briefs, deliverables, approvals, content links, and payout records.</li>
            <li>Public social-media metrics retrieved from third-party platforms (e.g. TikTok, Instagram, YouTube, X) using authorized APIs.</li>
            <li>Usage analytics and device/log data to operate and improve the Service.</li>
          </ul>

          <h2 className="font-semibold text-base mt-6">2. How we use your data</h2>
          <p>To provide and operate the Service, run campaigns, share reports and plans with brands, process creator payouts, send transactional emails, secure the Service, and improve features. We do not use your personal data for advertising.</p>

          <h2 className="font-semibold text-base mt-6">3. Sharing</h2>
          <p>We do not sell personal data. Campaign data is shared only with the contracting brand, the relevant agency, and the creators on the campaign, or via tokenized public links you generate. We use trusted infrastructure providers (hosting, database, email delivery) who process data on our behalf under written agreements.</p>

          <h2 className="font-semibold text-base mt-6">4. Connected platforms</h2>
          <p>When you connect a TikTok, Instagram, YouTube or X account, we receive only the data permitted by that platform and the scopes you approve. You can disconnect at any time from your account settings.</p>

          <h2 className="font-semibold text-base mt-6">5. Retention</h2>
          <p>We retain account and campaign data for as long as your account is active or as needed to provide the Service, comply with legal obligations, resolve disputes, and enforce agreements. You can request deletion at any time.</p>

          <h2 className="font-semibold text-base mt-6">6. Security</h2>
          <p>We use industry-standard safeguards including encryption in transit, access controls, and audit logging. No system is perfectly secure; please use a strong password and enable any available account protections.</p>

          <h2 className="font-semibold text-base mt-6">7. Your rights</h2>
          <p>You can request access, correction, export, or deletion of your data by emailing <a className="underline" href="mailto:privacy@darajapulse.com">privacy@darajapulse.com</a>. Where applicable under the Kenya Data Protection Act, GDPR, or other laws, you also have the right to object to or restrict certain processing and to lodge a complaint with your local data protection authority.</p>

          <h2 className="font-semibold text-base mt-6">8. Children</h2>
          <p>The Service is not intended for users under 18. We do not knowingly collect data from children.</p>

          <h2 className="font-semibold text-base mt-6">9. Cookies</h2>
          <p>We use essential cookies and similar technologies to keep you signed in and to measure how the Service is used. You can control cookies through your browser settings.</p>

          <h2 className="font-semibold text-base mt-6">10. Changes</h2>
          <p>We may update this policy from time to time. Material changes will be communicated via the Service or by email.</p>

          <h2 className="font-semibold text-base mt-6">11. Contact</h2>
          <p>Privacy questions: <a className="underline" href="mailto:privacy@darajapulse.com">privacy@darajapulse.com</a> · General: <a className="underline" href="mailto:hello@darajapulse.com">hello@darajapulse.com</a></p>
        </div>
      </div>
    </div>
    <PublicFooter />
  </div>
);
export default Privacy;
