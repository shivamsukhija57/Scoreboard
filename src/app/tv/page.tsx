import type { Metadata } from "next";
import { redirect } from "next/navigation";
import TvBoard from "@/components/tv-board";
import { getUserAccess, presentCompetition } from "@/lib/access";
import { readCompetition } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Division Wars · TV" };

export default async function TvPage() {
  const access = await getUserAccess();
  if (!access) redirect("/login");
  const data = presentCompetition(await readCompetition(), access);
  return <TvBoard initialData={data} />;
}
