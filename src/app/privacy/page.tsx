import { LegalPage } from "@/components/legal-page";

export const metadata = { title: "Privacy Policy · Venner SEO" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="23 November 2026">
      <p>
        Venner SEO (seo.vennerwp.com) is operated by Venner Infotech &amp; Marketing Solution (&quot;Venner&quot;, &quot;we&quot;).
        Our agency uses it to manage SEO, content and Google Business Profile work for our clients. This policy explains
        what data the service handles and how.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>Account details: name, company, email address and a hashed password.</li>
        <li>Website details you add: domain, business name, address and settings.</li>
        <li>Content we create for you, such as articles, review replies and reports.</li>
        <li>Data from Google services you choose to connect (see below).</li>
      </ul>

      <h2>Google user data</h2>
      <p>If you connect a Google account, Venner SEO requests only the access it needs:</p>
      <ul>
        <li><b>Google Search Console</b> (read-only): search clicks, impressions, queries and pages for your verified sites, used to show results and plan content.</li>
        <li><b>Google Business Profile</b>: profile details, performance metrics and reviews, used to show insights, draft review replies and update your profile when you ask.</li>
      </ul>
      <p>
        Venner SEO&apos;s use and transfer of information received from Google APIs adheres to the{" "}
        <a className="underline" href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>,
        including the Limited Use requirements. We do not sell Google user data, use it for advertising, or let people read it
        except where you ask us to, for security, or where the law requires it. We do not use it to train general AI models.
      </p>
      <p>
        Access tokens are stored encrypted on our server. You can disconnect at any time from the Connections page in the app,
        or from your Google account&apos;s security settings, and we stop using the access straight away.
      </p>

      <h2>How we use information</h2>
      <p>
        Only to run the service: show your dashboards, write and publish content you approve, produce reports and contact you
        about your account. Text may be sent to our AI provider (Anthropic) to draft content; it is not used to train their models.
      </p>

      <h2>Sharing</h2>
      <p>
        We share data only with service providers that host or run Venner SEO (our server, database and AI provider), with
        people you invite to your workspace, and through report links you choose to create.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        We keep data while your account is active. To delete your account or any connected data, email us and we will remove it
        within 30 days.
      </p>

      <h2>Contact</h2>
      <p>Questions about this policy: <a className="underline" href="mailto:rohitgvariya@gmail.com">rohitgvariya@gmail.com</a></p>
    </LegalPage>
  );
}
