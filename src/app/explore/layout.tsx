import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bottles",
};

export default function ExploreLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
