import { getCurrentLmsUser } from "@/lib/lms/current-user";
import { LmsSidebar } from "@/components/lms/layout/lms-sidebar";
import { LmsHeader } from "@/components/lms/layout/lms-header";
import { redirect } from "next/navigation";

export default async function LmsAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentLmsUser();

  if (!user) {
    // User punya session tapi tidak terdaftar di LMS
    redirect("/lms/login?error=no-lms-access");
  }

  return (
    <div className="flex min-h-screen bg-white">
      <LmsSidebar role={user.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <LmsHeader user={user} />
        <main className="min-w-0 flex-1 bg-neutral-50/50 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
