import { auth, currentUser } from "@clerk/nextjs/server";
import SiteHeader from "@/components/ui/SiteHeader";
import RegistrationForm from "@/components/registration/RegistrationForm";

export default async function RegisterPage() {
  await auth.protect();
  const user = await currentUser();
  const viewerEmail = user?.primaryEmailAddress?.emailAddress ?? "";
  const viewerName =
    user?.fullName ??
    user?.firstName ??
    user?.username ??
    viewerEmail;

  return (
    <main className="page-shell">
      <SiteHeader />
      <RegistrationForm viewerEmail={viewerEmail} viewerName={viewerName} />
    </main>
  );
}
