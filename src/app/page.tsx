import { HomePageClient } from "@/components/home-page-client";
import { fetchHomepageData } from "@/lib/homepage-data";

export const revalidate = 60;

export default async function HomePage() {
  const initialData = await fetchHomepageData();

  return <HomePageClient initialData={initialData} />;
}
