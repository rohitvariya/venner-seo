import { LegalPage } from "@/components/legal-page";

export const metadata = { title: "Terms of Service · Venner SEO" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="23 November 2026">
      <p>
        These terms cover your use of Venner SEO (seo.vennerwp.com), operated by Venner Infotech &amp; Marketing Solution
        (&quot;Venner&quot;). By signing in you agree to them.
      </p>

      <h2>The service</h2>
      <p>
        Venner SEO is a tool our agency uses to deliver SEO, content and local-search work for clients. Access is by invitation
        from Venner. Features may change as we improve the service.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Keep your login details private and tell us if you think someone else has used them.</li>
        <li>Only connect websites and Google accounts you own or are authorised to manage.</li>
        <li>You are responsible for content you approve for publishing.</li>
      </ul>

      <h2>Content and data</h2>
      <p>
        You own your website content and data. You give Venner permission to use it only to provide the service. Content we
        write for you becomes yours once published. Our handling of personal and Google data is described in our{" "}
        <a className="underline" href="/privacy">Privacy Policy</a>.
      </p>

      <h2>Acceptable use</h2>
      <p>Do not use the service to break the law, publish misleading or harmful content, or interfere with the service or other users.</p>

      <h2>No guarantees</h2>
      <p>
        Search rankings depend on Google and many other factors, so we cannot promise specific results. The service is provided
        &quot;as is&quot;, and to the extent the law allows, Venner is not liable for indirect losses arising from its use.
      </p>

      <h2>Ending access</h2>
      <p>You can stop using the service at any time. We may suspend access that breaks these terms or when a client engagement ends.</p>

      <h2>Contact</h2>
      <p>Questions: <a className="underline" href="mailto:rohitgvariya@gmail.com">rohitgvariya@gmail.com</a>. These terms are governed by the laws of India.</p>
    </LegalPage>
  );
}
