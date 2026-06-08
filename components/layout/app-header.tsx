import { Button } from "@/components/ui/button";
import { DivisionSwitcher } from "./division-switcher";
import type { CurrentUser } from "@/lib/auth/current-user";

export function AppHeader({ user }: { user: CurrentUser }) {
  const initial = user.email?.charAt(0).toUpperCase() || "?";

  return (
    <header className="flex h-16 items-center justify-between gap-3 border-b border-neutral-100 bg-white px-4 sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <DivisionSwitcher
          divisions={user.divisions}
          activeDivisionCode={user.activeDivisionCode}
        />
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {/* Email pill — disembunyikan di mobile (cuma tampil ikon avatar) */}
        <div className="flex items-center gap-2 rounded-full bg-neutral-50 py-1.5 pl-1.5 pr-1.5 sm:gap-3 sm:pr-4">
          <div className="mesh-purple grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold text-white">
            {initial}
          </div>
          <span className="hidden max-w-[200px] truncate text-sm font-medium text-neutral-700 sm:inline">
            {user.email}
          </span>
        </div>
        <form action="/auth/sign-out" method="post">
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="rounded-full"
          >
            Keluar
          </Button>
        </form>
      </div>
    </header>
  );
}
