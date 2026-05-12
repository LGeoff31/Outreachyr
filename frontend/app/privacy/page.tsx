import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Outreachyr",
  description:
    "How Outreachyr collects, uses, and shares information when you use our recruiter outreach service.",
};

const LAST_UPDATED = "May 11, 2026";

function contactEmail() {
  return (
    process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "contact@yourdomain.com"
  );
}

export default function PrivacyPolicyPage() {
  const email = contactEmail();

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 text-foreground sm:px-8 lg:py-14">
      <p className="text-sm text-muted-foreground">
        <Link
          href="/"
          className="font-medium text-primary hover:underline"
        >
          ← Back to home
        </Link>
        {" · "}
        <time dateTime="2026-05-11">Last updated {LAST_UPDATED}</time>
      </p>

      <h1 className="mt-8 text-3xl font-semibold tracking-tight sm:text-4xl">
        Privacy Policy
      </h1>

      <p className="mt-6 text-sm leading-6 text-muted-foreground">
        This Privacy Policy describes how Outreachyr (“we”, “us”, or “our”)
        handles information when you use our websites, applications, and related
        services (collectively, the “Service”). By using the Service, you
        agree to this policy. If you do not agree, do not use the Service.
      </p>

      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        We are not your law firm. You should have qualified counsel review this
        policy and your practices, especially if you operate in regulated
        industries or serve users in multiple regions.
      </p>

      <section className="mt-10 space-y-4 text-sm leading-7 text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">
          1. Who we are
        </h2>
        <p>
          The Service is operated by the entity publishing this website
          (“Outreachyr”). For privacy requests, contact us at{" "}
          <a
            href={`mailto:${email}`}
            className="font-medium text-primary hover:underline"
          >
            {email}
          </a>
        </p>
      </section>

      <section className="mt-10 space-y-4 text-sm leading-7 text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">
          2. Information we collect
        </h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-foreground">Account and authentication.</strong>{" "}
            When you sign in with Google, our authentication provider (Supabase)
            processes account identifiers and profile details that Google shares
            with us according to your choices (such as your name and email
            address). We use this to identify your session and operate the
            Service.
          </li>
          <li>
            <strong className="text-foreground">OAuth tokens for Gmail.</strong>{" "}
            If you authorize us, we request permission to send email on your
            behalf using Google’s APIs (for example, the Gmail send scope). Our
            systems may store refresh tokens or related credentials needed to
            perform actions you initiate (such as sending a campaign you
            reviewed). Do not use the Service if you are not willing to grant
            the permissions requested in the consent screen.
          </li>
          <li>
            <strong className="text-foreground">Content you provide.</strong>{" "}
            This may include company names, email subject lines and bodies,
            attachments such as résumés/PDFs, and similar campaign materials.
          </li>
          <li>
            <strong className="text-foreground">Derived and third‑party data.</strong>{" "}
            To suggest recruiter-related contacts, we may query third‑party
            search or enrichment services (for example, SerpAPI) using terms you
            supply. Results can include publicly available information such as
            inferred email patterns; accuracy is not guaranteed.
          </li>
          <li>
            <strong className="text-foreground">Technical data.</strong>{" "}
            We collect standard server and device data such as IP address,
            browser type, approximate location derived from IP, cookies or
            similar identifiers, and diagnostic logs used for security and
            reliability.
          </li>
        </ul>
      </section>

      <section className="mt-10 space-y-4 text-sm leading-7 text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">
          3. How we use information
        </h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Provide, operate, maintain, and improve the Service.</li>
          <li>
            Authenticate users, prevent fraud or abuse, and protect security.
          </li>
          <li>
            Send email through your connected Google account when you explicitly
            choose to send messages you have composed or approved in the
            product.
          </li>
          <li>
            Communicate with you about the Service (for example, support
            responses).
          </li>
          <li>Comply with law and enforce our Terms.</li>
        </ul>
      </section>

      <section className="mt-10 space-y-4 text-sm leading-7 text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">
          4. How we share information
        </h2>
        <p>We may share information with:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-foreground">Infrastructure providers</strong>{" "}
            that host the Service, store data, or provide logging and security
            (for example, Supabase, cloud hosting, and analytics if enabled).
          </li>
          <li>
            <strong className="text-foreground">Google</strong> when you use
            Google sign‑in or Gmail APIs, subject to Google’s policies.
          </li>
          <li>
            <strong className="text-foreground">Search/API vendors</strong> you
            indirectly use when running features that query external data.
          </li>
          <li>
            <strong className="text-foreground">Professional advisors</strong>{" "}
            or authorities when required by law, legal process, or to protect
            rights and safety.
          </li>
          <li>
            <strong className="text-foreground">Business transfers</strong> if
            we are involved in a merger, acquisition, or asset sale (we will
            require successor obligations when feasible).
          </li>
        </ul>
        <p>
          We do not sell your personal information in the customary sense of
          “selling data for money.” If we use advertising or analytics that
          constitute a “sale” or “sharing” under U.S. state laws, we will
          provide legally required notices and choices.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-sm leading-7 text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">
          5. Retention
        </h2>
        <p>
          We keep information only as long as needed for the purposes above,
          unless a longer period is required by law. Session tokens and campaign
          data may be deleted or anonymized when you delete your account or when
          no longer needed—specific retention depends on how you deploy the
          product.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-sm leading-7 text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">
          6. Security
        </h2>
        <p>
          We use reasonable administrative, technical, and organizational
          measures to protect information. No method of transmission or storage
          is completely secure.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-sm leading-7 text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">
          7. Your choices and rights
        </h2>
        <p>
          Depending on where you live, you may have rights to access, correct,
          delete, or restrict processing of personal data, or to object or
          appeal certain processing. Contact us at the email above. You can also
          revoke Google access in your Google Account security settings.
        </p>
        <p>
          If you are in the EEA, UK, or Switzerland, you may also lodge a
          complaint with your local supervisory authority.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-sm leading-7 text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">
          8. International transfers
        </h2>
        <p>
          We may process information in the United States and other countries
          where we or our vendors operate. When we transfer personal data across
          borders, we use appropriate safeguards where required by law.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-sm leading-7 text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">
          9. Children
        </h2>
        <p>
          The Service is not directed to children under 16. We do not knowingly
          collect personal information from children.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-sm leading-7 text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">
          10. Changes
        </h2>
        <p>
          We may update this Privacy Policy from time to time. We will post the
          updated version and revise the “Last updated” date.
        </p>
      </section>

      <p className="mt-12 text-sm text-muted-foreground">
        See also our{" "}
        <Link href="/terms" className="font-medium text-primary hover:underline">
          Terms of Service
        </Link>
        .
      </p>
    </div>
  );
}
