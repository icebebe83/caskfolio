import type { Metadata } from "next";

import { ListingPolicyContent } from "@/components/legal-pages";

export const metadata: Metadata = {
  title: "Listing Policy",
};

export default function ListingPolicyPage() {
  return <ListingPolicyContent />;
}
