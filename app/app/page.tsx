import { auth } from "@clerk/nextjs/server";
import SiteHeader from "@/components/ui/SiteHeader";
import ParticipantDashboard from "@/components/participant/ParticipantDashboard";

export default async function ParticipantPage() {
  await auth.protect();

  return (
    <main className="page-shell">
      <SiteHeader />
      <ParticipantDashboard />
    </main>
  );
}
