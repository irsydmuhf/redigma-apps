import { AppHeader } from "@/components/layout/app-header";
import { Sidebar } from "@/components/layout/sidebar";
import { getCurrentUser } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen bg-white">
      <Sidebar isAdmin={user.isAdmin} />
      {/* min-w-0 critical: tanpa ini, child dengan content lebar (tabel)
          memaksa parent flex membesar, bikin layout overflow horizontal */}
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader user={user} />
        <main className="min-w-0 flex-1 bg-neutral-50/50 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
