import type { Metadata } from "next";

import { TermsOfServiceContent } from "@/components/legal-pages";

export const metadata: Metadata = {
  title: "Terms of Service",
};

export default function TermsOfServicePage() {
  return <TermsOfServiceContent />;
}
