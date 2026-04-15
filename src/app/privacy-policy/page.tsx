import type { Metadata } from "next";

import { PrivacyPolicyContent } from "@/components/legal-pages";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPolicyPage() {
  return <PrivacyPolicyContent />;
}
