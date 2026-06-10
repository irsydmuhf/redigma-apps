import { getCurrentLmsUser } from "@/lib/lms/current-user";
import { redirect } from "next/navigation";

export default async function LmsManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentLmsUser();

  if (!user || (user.role !== "manager" && user.role !== "admin")) {
    redirect("/lms/dashboard");
  }

  return <>{children}</>;
}
