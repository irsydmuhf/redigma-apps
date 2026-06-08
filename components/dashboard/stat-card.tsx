import type { LucideIcon } from "lucide-react";

type Variant = "blue" | "red" | "yellow" | "green" | "purple";

const VARIANTS: Record<Variant, string> = {
  blue: "mesh-blue",
  red: "mesh-red",
  yellow: "mesh-yellow",
  green: "mesh-green",
  purple: "mesh-purple",
};

export function StatCard({
  variant,
  label,
  value,
  trend,
  icon: Icon,
}: {
  variant: Variant;
  label: string;
  value: string;
  trend?: string;
  icon: LucideIcon;
}) {
  return (
    <div
      className={`${VARIANTS[variant]} relative overflow-hidden rounded-3xl p-7 text-white shadow-sm`}
    >
      <div className="flex items-start justify-between">
        <div className="rounded-2xl bg-white/20 p-2.5 backdrop-blur-sm">
          <Icon className="h-5 w-5 text-white" />
        </div>
        {trend && (
          <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-medium backdrop-blur-sm">
            {trend}
          </span>
        )}
      </div>

      <div className="mt-8 space-y-1">
        <p className="text-sm font-medium text-white/80">{label}</p>
        <p className="text-3xl font-bold tracking-tight">{value}</p>
      </div>
    </div>
  );
}
