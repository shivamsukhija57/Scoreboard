import { redirect } from "next/navigation";
import Dashboard from "@/components/dashboard";
import { getUserAccess, presentCompetition } from "@/lib/access";
import { readCompetition } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const access = await getUserAccess();
  if (!access) redirect("/login");
  const data = await readCompetition();
  // The role switcher is only for the local demo account. Signed-out guests are spectators and see a spectator's app.
  const previewMode = access.email === "preview@spjimr.org";
  return <Dashboard data={presentCompetition(data, access)} access={access} previewMode={previewMode} />;
}
