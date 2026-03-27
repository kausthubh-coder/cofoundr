import SiteHeader from "@/components/ui/SiteHeader";
import AdminDashboard from "@/components/admin/AdminDashboard";

export default async function AdminPage() {
  return (
    <main className="page-shell">
      <SiteHeader />
      <AdminDashboard />
    </main>
  );
}
