import { Button } from "@/components/ui/button";
import type { LmsUser } from "@/lib/lms/current-user";
import { LmsMobileNav } from "@/components/lms/layout/lms-mobile-nav";

const ROLE_LABEL: Record<string, string> = {
  adv: "Advertiser",
  manager: "Manager",
  admin: "Admin",
};

export function LmsHeader({ user }: { user: LmsUser }) {
  const initial = user.fullName?.charAt(0).toUpperCase() || "?";

  return (
    <header className="flex h-16 items-center justify-between gap-3 border-b border-neutral-100 bg-white px-4 sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-2">
        <LmsMobileNav role={user.role} />
        <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-600">
          {ROLE_LABEL[user.role]}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2 rounded-full bg-neutral-50 py-1.5 pl-1.5 sm:gap-3 sm:pr-4 pr-1.5">
          <div className="mesh-blue grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold text-white">
            {initial}
          </div>
          <span className="hidden max-w-[180px] truncate text-sm font-medium text-neutral-700 sm:inline">
            {user.fullName}
          </span>
        </div>
        <form action="/auth/sign-out" method="post">
          <Button type="submit" variant="outline" size="sm" className="rounded-full">
            Keluar
          </Button>
        </form>
      </div>
    </header>
  );
}
