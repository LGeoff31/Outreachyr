import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | Outreachyr",
  description:
    "Terms governing your use of Outreachyr recruiter outreach tools and related services.",
};

const LAST_UPDATED = "May 11, 2026";

function contactEmail() {
  return (
    process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "contact@yourdomain.com"
  );
}

export default function TermsOfServicePage() {
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
        Terms of Service
      </h1>

      <p className="mt-6 text-sm leading-6 text-muted-foreground">
        These Terms of Service (“Terms”) are a binding agreement between you
        (“you”) and the operator of Outreachyr (“we”, “us”, or “our”) governing
        your access to and use of the Outreachyr websites, applications, and
        related services (the “Service”). By accessing or using the Service, you
        agree to these Terms. If you do not agree, do not use the Service.
      </p>

      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        These Terms are provided for convenience and are not legal advice. You
        should have counsel review them for your jurisdiction and business
        model.
      </p>

      <section className="mt-10 space-y-4 text-sm leading-7 text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">
          1. Eligibility
        </h2>
        <p>
          You must be able to form a legally binding contract where you live. If
          you use the Service on behalf of an organization, you represent that
          you have authority to bind that organization, and “you” includes the
          organization.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-sm leading-7 text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">
          2. The Service
        </h2>
        <p>
          Outreachyr provides tools to help you research contacts, draft
          outreach, review messages, and—when you choose—send email using your
          connected Google account. Features may change, and we may suspend or
          discontinue parts of the Service.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-sm leading-7 text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">
          3. Accounts and third-party services
        </h2>
        <p>
          You may need an account via our authentication providers (such as
          Supabase) and Google sign‑in. You are responsible for safeguarding
          your credentials and for activity under your account.
        </p>
        <p>
          Your use of Google services is also subject to Google’s terms and
          policies. If you grant Gmail or other Google permissions, you
          understand we may act on your behalf only as permitted by those
          permissions and your actions inside the product.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-sm leading-7 text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">
          4. Acceptable use
        </h2>
        <p>You agree not to, and not to help others to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Violate law, including anti‑spam laws (such as CAN‑SPAM in the
            United States, CASL in Canada, or comparable rules where recipients
            live), employment or anti‑discrimination law, or intellectual
            property rights.
          </li>
          <li>
            Send misleading, deceptive, or fraudulent messages, or impersonate
            another person or entity.
          </li>
          <li>
            Harvest, scrape, or collect contact data in violation of applicable
            terms or laws, or use the Service to harass, threaten, or harm
            anyone.
          </li>
          <li>
            Probe, scan, or test the vulnerability of our systems; interfere
            with the Service; or bypass security or access controls.
          </li>
          <li>
            Reverse engineer (except where applicable law forbids this
            restriction), resell, or commercially exploit the Service without
            our written permission.
          </li>
        </ul>
        <p>
          You are solely responsible for the content of messages you send and
          for obtaining any required consents or rights. You represent that you
          have a legitimate basis to contact recipients.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-sm leading-7 text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">
          5. Inferred contacts and accuracy
        </h2>
        <p>
          Features may suggest recipients or addresses using heuristics and
          public information. Suggestions can be wrong. You must verify
          accuracy and appropriateness before sending. We are not responsible
          for incorrect contacts or failed delivery.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-sm leading-7 text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">
          6. Intellectual property
        </h2>
        <p>
          We retain all rights in the Service, our branding, and our software.
          You retain your content; you grant us a non‑exclusive license to host,
          process, and display your content as needed to provide the Service.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-sm leading-7 text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">
          7. Disclaimers
        </h2>
        <p>
          THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE.” TO THE MAXIMUM
          EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, WHETHER EXPRESS,
          IMPLIED, OR STATUTORY, INCLUDING MERCHANTABILITY, FITNESS FOR A
          PARTICULAR PURPOSE, AND NON‑INFRINGEMENT. WE DO NOT WARRANT THAT THE
          SERVICE WILL BE UNINTERRUPTED, ERROR‑FREE, OR THAT RESULTS WILL MEET
          YOUR EXPECTATIONS.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-sm leading-7 text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">
          8. Limitation of liability
        </h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, NEITHER WE NOR OUR SUPPLIERS
          WILL BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
          OR EXEMPLARY DAMAGES, OR DAMAGES FOR LOST PROFITS, REVENUE, GOODWILL,
          DATA, OR BUSINESS INTERRUPTION, EVEN IF WE HAVE BEEN ADVISED OF THE
          POSSIBILITY. OUR TOTAL LIABILITY FOR CLAIMS ARISING OUT OF OR RELATING
          TO THE SERVICE OR TERMS WILL NOT EXCEED THE GREATER OF (A) AMOUNTS
          YOU PAID US FOR THE SERVICE IN THE TWELVE (12) MONTHS BEFORE THE CLAIM
          OR (B) ONE HUNDRED U.S. DOLLARS (US $100), IF YOU HAVE NOT PAID US.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-sm leading-7 text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">
          9. Indemnity
        </h2>
        <p>
          You will defend, indemnify, and hold us harmless from any claims,
          damages, losses, and expenses (including reasonable attorneys’ fees)
          arising out of your content, your messages, your violation of these
          Terms, or your violation of others’ rights.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-sm leading-7 text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">
          10. Suspension and termination
        </h2>
        <p>
          We may suspend or terminate access to the Service for violation of
          these Terms, risk to security, or legal reasons. You may stop using the
          Service at any time. Provisions that by their nature should survive
          will survive termination.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-sm leading-7 text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">
          11. Changes
        </h2>
        <p>
          We may modify the Service or these Terms. If a change is material, we
          will make reasonable attempts to notify you (for example, by posting
          an updated date or notice in the product). Continued use after changes
          become effective constitutes acceptance unless applicable law requires
          a different process.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-sm leading-7 text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">
          12. Governing law and disputes
        </h2>
        <p>
          These Terms are governed by the laws of the State of Delaware, USA,
          excluding conflict-of-law rules, unless mandatory local law requires
          otherwise. Courts in Wilmington, Delaware shall have exclusive
          jurisdiction, unless you are a consumer entitled to a mandatory
          venue in your home jurisdiction.
        </p>
        <p>
          You may want to replace this section with your jurisdiction and
          dispute resolution process (for example, binding arbitration).
        </p>
      </section>

      <section className="mt-10 space-y-4 text-sm leading-7 text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">
          13. Contact
        </h2>
        <p>
          Questions about these Terms:{" "}
          <a
            href={`mailto:${email}`}
            className="font-medium text-primary hover:underline"
          >
            {email}
          </a>
        </p>
      </section>

      <p className="mt-12 text-sm text-muted-foreground">
        See also our{" "}
        <Link
          href="/privacy"
          className="font-medium text-primary hover:underline"
        >
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
