import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Page",
};

export default function MyPageLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
