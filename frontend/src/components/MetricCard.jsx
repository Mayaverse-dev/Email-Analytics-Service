import { TrendingUp } from "lucide-react";

export default function MetricCard({ label, value, subtitle, icon: Icon }) {
  return (
    <div className="card group">
      <div className="flex items-start justify-between">
        <p
          className="text-xs font-medium uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          {label}
        </p>
        {Icon ? (
          <Icon
            className="h-4 w-4 transition-transform duration-200 group-hover:scale-110"
            style={{ color: "var(--accent)" }}
          />
        ) : (
          <TrendingUp
            className="h-4 w-4 transition-transform duration-200 group-hover:scale-110"
            style={{ color: "var(--accent)" }}
          />
        )}
      </div>
      <p
        className="mt-3 text-3xl font-bold tracking-tight"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </p>
      {subtitle ? (
        <p
          className="mt-1 text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
