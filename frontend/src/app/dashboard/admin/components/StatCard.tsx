interface StatCardProps {
  label: string;
  value: string | number;
  icon?: string;
  trend?: { value: number; isPositive: boolean };
  color?: "blue" | "purple" | "emerald" | "amber" | "rose" | "cyan";
  subtitle?: string;
  large?: boolean;
}

const COLORS = {
  blue:    { gradient: "from-blue-500/10 to-blue-600/5",       border: "border-blue-500/20",    text: "text-blue-400",    icon: "bg-blue-500/15" },
  purple:  { gradient: "from-purple-500/10 to-purple-600/5",   border: "border-purple-500/20",  text: "text-purple-400",  icon: "bg-purple-500/15" },
  emerald: { gradient: "from-emerald-500/10 to-emerald-600/5", border: "border-emerald-500/20", text: "text-emerald-400", icon: "bg-emerald-500/15" },
  amber:   { gradient: "from-amber-500/10 to-amber-600/5",     border: "border-amber-500/20",   text: "text-amber-400",   icon: "bg-amber-500/15" },
  rose:    { gradient: "from-rose-500/10 to-rose-600/5",       border: "border-rose-500/20",    text: "text-rose-400",    icon: "bg-rose-500/15" },
  cyan:    { gradient: "from-cyan-500/10 to-cyan-600/5",       border: "border-cyan-500/20",    text: "text-cyan-400",    icon: "bg-cyan-500/15" },
};

export default function StatCard({ label, value, icon, trend, color = "blue", subtitle, large }: StatCardProps) {
  const c = COLORS[color];
  return (
    <div className={`relative overflow-hidden rounded-2xl border ${c.border} bg-gradient-to-br ${c.gradient} p-5 hover:scale-[1.01] transition-transform`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">{label}</p>
        </div>
        {icon && (
          <div className={`w-9 h-9 rounded-xl ${c.icon} flex items-center justify-center shrink-0`}>
            <span className="text-base">{icon}</span>
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <p className={`text-white font-bold ${large ? "text-4xl" : "text-3xl"}`}>{value}</p>
        {trend && (
          <span className={`text-xs font-medium ${trend.isPositive ? "text-emerald-400" : "text-rose-400"}`}>
            {trend.isPositive ? "↑" : "↓"} {Math.abs(trend.value)}%
          </span>
        )}
      </div>
      {subtitle && (
        <p className="text-slate-500 text-xs mt-1">{subtitle}</p>
      )}
    </div>
  );
}
