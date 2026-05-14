import PublicFooter from "@/components/PublicFooter";

const Terms = () => (
  <div className="min-h-screen bg-background flex flex-col">
    <div className="flex-1">
      <div className="max-w-3xl mx-auto px-6 md:px-10 py-12">
        <a href="/" className="text-sm text-muted-foreground hover:text-foreground">← Home</a>
        <h1 className="font-display text-4xl font-semibold mt-4 mb-2">Terms of Service</h1>
        <p className="text-muted-foreground text-sm">Last updated {new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })}</p>
        <div className="prose prose-sm max-w-none mt-8 space-y-4 text-sm leading-relaxed">
          <p>These Terms of Service ("Terms") govern your access to and use of the Daraja Pulse platform, including <a className="underline" href="https://darajapulse.com">darajapulse.com</a>, the application, public campaign pages, brief and report links, and any related services (collectively, the "Service"). By accessing or using the Service you agree to these Terms. If you do not agree, do not use the Service.</p>

          <h2 className="font-semibold text-base mt-6">1. Who we are</h2>
          <p>The Service is operated by Daraja Pulse, based in Nairobi, Kenya. You can reach us at <a className="underline" href="mailto:hello@darajapulse.com">hello@darajapulse.com</a>.</p>

          <h2 className="font-semibold text-base mt-6">2. Accounts</h2>
          <p>To use most features you must create an account. You are responsible for the accuracy of the information you provide and for keeping your credentials secure. You must be at least 18 years old, or the age of majority in your jurisdiction.</p>

          <h2 className="font-semibold text-base mt-6">3. Acceptable use</h2>
          <p>You agree to use the Service only for lawful purposes and in accordance with any campaign briefs, contracts, or written agreements between you, the brand, the agency, and the creators involved. You will not:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Misrepresent your identity or affiliation;</li>
            <li>Upload content that is unlawful, infringing, defamatory, deceptive, or that violates third-party rights;</li>
            <li>Attempt to access data, accounts, or systems you are not authorized to access;</li>
            <li>Reverse engineer, scrape, or interfere with the Service or its underlying APIs;</li>
            <li>Use the Service to send spam, run undisclosed paid promotions, or violate platform rules of TikTok, Instagram, YouTube, X or any other connected platform.</li>
          </ul>

          <h2 className="font-semibold text-base mt-6">4. Connected platforms</h2>
          <p>The Service connects to third-party platforms (e.g. TikTok, Instagram, YouTube, X) using their official APIs and your authorization. You are responsible for complying with each platform's terms of service. Reach, engagement and audience metrics shown in the Service are reported by those platforms and may change, be delayed, or be withdrawn without notice.</p>

          <h2 className="font-semibold text-base mt-6">5. Content and intellectual property</h2>
          <p>You retain ownership of content you upload. By uploading content to the Service, you grant Daraja Pulse a limited, non-exclusive, worldwide, royalty-free licence to host, display, and process that content solely to provide the Service to you and your collaborators. Content created by creators in connection with a campaign is licensed to the contracting brand on the terms of the individual creator brief. The Service interface, software, and trademarks remain the property of Daraja Pulse.</p>

          <h2 className="font-semibold text-base mt-6">6. Confidentiality</h2>
          <p>Campaign plans, briefs, fees, payout details, and creator information shared through tokenized links are confidential. Do not redistribute outside your organization or the parties named on the campaign.</p>

          <h2 className="font-semibold text-base mt-6">7. Payments</h2>
          <p>Where the Service is used to process creator payouts, you authorize Daraja Pulse to record, schedule, and disburse payments according to the brief and your instructions. You are responsible for any taxes, withholdings (including Kenyan WHT where applicable), and reporting obligations arising from your use of the Service.</p>

          <h2 className="font-semibold text-base mt-6">8. Fees</h2>
          <p>Some features of the Service may be paid. Pricing, billing terms, and refund policy will be presented to you before you incur any charges. Unless otherwise agreed in writing, fees are non-refundable.</p>

          <h2 className="font-semibold text-base mt-6">9. Suspension and termination</h2>
          <p>We may suspend or terminate access to the Service at any time if we reasonably believe these Terms have been breached, if required by law, or to protect users or the Service. You can stop using the Service and request account deletion at any time by emailing <a className="underline" href="mailto:hello@darajapulse.com">hello@darajapulse.com</a>.</p>

          <h2 className="font-semibold text-base mt-6">10. Disclaimer</h2>
          <p>The Service is provided "as is" and "as available" without warranties of any kind, whether express or implied. We do not warrant that the Service will be uninterrupted, error-free, or that any metrics or insights will be accurate or complete.</p>

          <h2 className="font-semibold text-base mt-6">11. Limitation of liability</h2>
          <p>To the maximum extent permitted by law, Daraja Pulse will not be liable for any indirect, incidental, consequential, special, or exemplary damages, or for any loss of profits, revenue, data, or goodwill, arising out of or in connection with your use of the Service. Our aggregate liability for any claim arising from the Service is limited to the amount you paid to us in the twelve months preceding the claim, or KES 10,000, whichever is greater.</p>

          <h2 className="font-semibold text-base mt-6">12. Indemnity</h2>
          <p>You agree to indemnify and hold harmless Daraja Pulse from any claim arising out of your content, your use of the Service in violation of these Terms, or your violation of any applicable law or third-party right.</p>

          <h2 className="font-semibold text-base mt-6">13. Changes to these Terms</h2>
          <p>We may update these Terms from time to time. Material changes will be communicated via the Service or by email. Continued use after changes take effect constitutes acceptance of the updated Terms.</p>

          <h2 className="font-semibold text-base mt-6">14. Governing law</h2>
          <p>These Terms are governed by the laws of the Republic of Kenya. The courts of Nairobi will have exclusive jurisdiction over any dispute arising out of or in connection with these Terms or the Service.</p>

          <h2 className="font-semibold text-base mt-6">15. Contact</h2>
          <p>Questions about these Terms: <a className="underline" href="mailto:hello@darajapulse.com">hello@darajapulse.com</a>.</p>
        </div>
      </div>
    </div>
    <PublicFooter />
  </div>
);
export default Terms;
