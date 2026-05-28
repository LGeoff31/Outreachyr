import type { Metadata } from "next";

import { LandingDifferentiators } from "@/components/LandingDifferentiators";
import { PricingSection } from "@/components/PricingSection";

export const metadata: Metadata = {
  title: "Pricing | Outreachyr",
  description:
    "Try Outreachyr with 3 free campaigns. Verified recruiter emails and personalized outreach — not LinkedIn spam. Unlock unlimited campaigns for $5 one-time.",
};

export default function PricingPage() {
  return (
    <div className="overflow-x-hidden bg-background text-foreground">
      <LandingDifferentiators />
      <PricingSection />
    </div>
  );
}
