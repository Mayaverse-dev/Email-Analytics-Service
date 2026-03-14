import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { getDashboardParentFolders } from "../api/client";
import { fmtDate, fmtInt, fmtPercent } from "../utils/format";

const CARD_CHART_WIDTH = 360;
const CARD_CHART_HEIGHT = 220;
const MODAL_CHART_WIDTH = 760;
const MODAL_CHART_HEIGHT = 320;

function getHistoryValue(point) {
  return Number(point?.value ?? point?.total_users ?? 0);
}

function formatChartValue(value, format) {
  return format === "percent" ? fmtPercent(value) : fmtInt(value);
}

function formatAxisDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

function buildChartData(history, width, height, padding = 24) {
  if (!history || history.length === 0) {
    return {
      points: [],
      path: "",
      areaPath: "",
      startLabel: "",
      endLabel: "",
      currentValue: 0,
      minValue: 0,
      midValue: 0,
      maxValue: 0,
      padding,
      usableHeight: Math.max(height - padding * 2, 1),
    };
  }

  const sorted = [...history].sort(
    (a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()
  );
  const values = sorted.map((point) => getHistoryValue(point));
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue;
  const usableWidth = Math.max(width - padding * 2, 1);
  const usableHeight = Math.max(height - padding * 2, 1);

  const points = (sorted.length === 1 ? [sorted[0], sorted[0]] : sorted).map((point, index, arr) => {
    const x = padding + (usableWidth * index) / Math.max(arr.length - 1, 1);
    const normalizedY = range === 0 ? 0.5 : (getHistoryValue(point) - minValue) / range;
    const y = padding + usableHeight - normalizedY * usableHeight;
    return { x, y, value: getHistoryValue(point), capturedAt: point.captured_at };
  });

  const path = points.map((point) => `${point.x},${point.y}`).join(" ");
  const areaPath = [
    `M ${points[0].x} ${height - padding}`,
    ...points.map((point) => `L ${point.x} ${point.y}`),
    `L ${points[points.length - 1].x} ${height - padding}`,
    "Z",
  ].join(" ");

  return {
    points,
    path,
    areaPath,
    startLabel: sorted[0]?.captured_at || "",
    endLabel: sorted[sorted.length - 1]?.captured_at || "",
    currentValue: values[values.length - 1] || 0,
    minValue,
    midValue: minValue + range / 2,
    maxValue,
    padding,
    usableHeight,
  };
}

function TrendChart({ history, width, height, compact = false, format = "integer", showAxes = false }) {
  const padding = showAxes ? 52 : compact ? 18 : 24;
  const chart = useMemo(
    () => buildChartData(history, width, height, padding),
    [height, history, padding, width]
  );
  const [hoveredIndex, setHoveredIndex] = useState(null);

  useEffect(() => {
    setHoveredIndex(chart.points.length > 0 ? chart.points.length - 1 : null);
  }, [chart.endLabel, chart.points.length]);

  if (chart.points.length === 0) {
    return null;
  }

  const hoveredPoint = hoveredIndex === null ? null : chart.points[hoveredIndex] || null;
  const gridLineYs = [
    chart.padding,
    chart.padding + chart.usableHeight / 2,
    height - chart.padding,
  ];

  function handlePointerMove(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;

    const relativeX = ((event.clientX - rect.left) / rect.width) * width;
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    chart.points.forEach((point, index) => {
      const distance = Math.abs(point.x - relativeX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    setHoveredIndex(nearestIndex);
  }

  return (
    <div className="relative h-full w-full">
      {showAxes && hoveredPoint ? (
        <div
          className="pointer-events-none absolute left-4 top-4 z-10 rounded-xl border px-3 py-2 text-xs shadow-lg"
          style={{
            backgroundColor: "var(--tooltip-bg)",
            borderColor: "var(--border-color)",
            color: "var(--tooltip-text)",
          }}
        >
          <p className="font-semibold">{formatChartValue(hoveredPoint.value, format)}</p>
          <p style={{ color: "var(--chart-label)" }}>{fmtDate(hoveredPoint.capturedAt)}</p>
        </div>
      ) : null}

      {showAxes ? (
        <div
          className="pointer-events-none absolute inset-y-4 left-3 z-10 flex flex-col justify-between text-xs font-medium"
          style={{ color: "var(--chart-label)" }}
        >
          <span>{formatChartValue(chart.maxValue, format)}</span>
          <span>{formatChartValue(chart.midValue, format)}</span>
          <span>{formatChartValue(chart.minValue, format)}</span>
        </div>
      ) : null}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-full w-full"
        aria-hidden="true"
        preserveAspectRatio="none"
        onMouseMove={showAxes ? handlePointerMove : undefined}
        onMouseLeave={showAxes ? () => setHoveredIndex(chart.points.length - 1) : undefined}
      >
        {showAxes ? (
          <>
            {gridLineYs.map((y) => (
              <line
                key={y}
                x1={chart.padding}
                y1={y}
                x2={width - chart.padding}
                y2={y}
                stroke="var(--chart-grid)"
                strokeDasharray="6 8"
                strokeWidth="1"
              />
            ))}
          </>
        ) : null}
        <path d={chart.areaPath} fill="var(--chart-fill)" />
        <polyline
          fill="none"
          stroke="var(--chart-line)"
          strokeWidth={compact ? 4 : 4}
          strokeLinecap="round"
          strokeLinejoin="round"
          points={chart.path}
        />
        {hoveredPoint ? (
          <>
            {showAxes ? (
              <line
                x1={hoveredPoint.x}
                y1={chart.padding}
                x2={hoveredPoint.x}
                y2={height - chart.padding}
                stroke="var(--chart-grid)"
                strokeWidth="1.5"
                strokeDasharray="4 6"
              />
            ) : null}
            <circle
              cx={hoveredPoint.x}
              cy={hoveredPoint.y}
              r={compact ? 4.5 : 5}
              fill="var(--chart-line)"
            />
          </>
        ) : null}
      </svg>
    </div>
  );
}

function GraphModal({ item, onClose }) {
  if (!item) return null;

  return (
    <div
      className="fixed left-1/2 top-1/2 z-50 w-[min(920px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-3xl border shadow-2xl"
      style={{
        backgroundColor: "var(--bg-primary)",
        borderColor: "var(--border-color)",
      }}
    >
      <div
        className="flex items-start justify-between gap-4 border-b px-6 py-5"
        style={{ borderColor: "var(--border-color)" }}
      >
        <div>
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
              {item.title}
            </h2>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {item.description}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="btn-ghost p-1.5">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-col gap-6 px-6 py-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              {item.valueLabel}
            </p>
            <p className="text-5xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
              {item.displayValue}
            </p>
          </div>
          <div className="text-sm" style={{ color: "var(--text-muted)" }}>
            {item.history?.length > 0
              ? `Latest snapshot: ${fmtDate(item.history[item.history.length - 1].captured_at)}`
              : "No snapshot data"}
          </div>
        </div>

        <div
          className="rounded-2xl border p-4"
          style={{
            borderColor: "var(--border-color)",
            backgroundColor: "var(--bg-secondary)",
          }}
        >
          <div className="h-80 w-full">
            <TrendChart
              history={item.history || []}
              width={MODAL_CHART_WIDTH}
              height={MODAL_CHART_HEIGHT}
              format={item.format}
              showAxes
            />
          </div>
          <div className="mt-4 flex items-center justify-between text-xs" style={{ color: "var(--chart-label)" }}>
            <span>{item.history?.[0]?.captured_at ? formatAxisDate(item.history[0].captured_at) : "Start"}</span>
            <span>
              {item.history?.length ? formatAxisDate(item.history[item.history.length - 1].captured_at) : "Now"}
            </span>
          </div>
        </div>

        {(item.history || []).length < 2 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Only one snapshot is available so far. More history will appear after future syncs.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function DashboardCard({ label, value, history, format = "integer", onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-full flex-col gap-4 text-left"
    >
      <div
        className="relative flex min-h-[220px] flex-1 items-end overflow-hidden rounded-[28px] border p-6 transition-all duration-200 group-hover:-translate-y-1 group-hover:shadow-lg"
        style={{
          borderColor: "var(--border-color)",
          backgroundColor: "var(--bg-primary)",
          boxShadow: "0 12px 32px rgba(0, 0, 0, 0.06)",
        }}
      >
        <div className="absolute inset-0">
          <TrendChart
            history={history || []}
            width={CARD_CHART_WIDTH}
            height={CARD_CHART_HEIGHT}
            compact
            format={format}
          />
        </div>
        <div className="relative z-10 pb-2">
          <p
            className={`${format === "percent" ? "text-5xl" : "text-6xl"} font-semibold tracking-tight`}
            style={{ color: "var(--text-primary)" }}
          >
            {formatChartValue(value, format)}
          </p>
        </div>
      </div>
      <div className="flex min-h-[72px] items-start">
        <p className="text-3xl font-medium leading-tight" style={{ color: "var(--text-primary)" }}>
          {label}
        </p>
      </div>
    </button>
  );
}

export default function DashboardPage({ refreshToken = 0 }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [parentFolders, setParentFolders] = useState([]);
  const [overallMetrics, setOverallMetrics] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        const response = await getDashboardParentFolders();
        if (!mounted) return;
        setParentFolders(response.parent_folders || []);
        setOverallMetrics(response.overall_metrics || []);
      } catch (err) {
        if (mounted) setError(err.message || "Failed to load dashboard");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [refreshToken]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--accent)" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/20">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-1">
        <h1 className="page-title">Dashboard</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Parent-folder audience overview. Click a card to open its graph.
        </p>
      </div>

      {parentFolders.length === 0 ? (
        <div className="card">
          <p style={{ color: "var(--text-muted)" }}>
            No parent-folder data available yet.
          </p>
        </div>
      ) : (
        <div className="grid auto-rows-fr gap-8 sm:grid-cols-2 xl:grid-cols-3">
          {parentFolders.map((folder) => (
            <DashboardCard
              key={folder.id}
              label={folder.name}
              value={folder.total_users}
              history={folder.history || []}
              onClick={() => setSelectedCard({
                title: folder.name,
                description: "Deduplicated users over time",
                valueLabel: "Current Count",
                displayValue: fmtInt(folder.total_users),
                format: "integer",
                history: folder.history || [],
              })}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="section-title">All Users</h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Deduplicated engagement and list-health metrics across all users. Click a card to open its graph.
          </p>
        </div>

        <div className="grid auto-rows-fr gap-8 sm:grid-cols-2 xl:grid-cols-4">
          {overallMetrics.map((metric) => (
            <DashboardCard
              key={metric.key}
              label={metric.label}
              value={metric.value}
              history={metric.history || []}
              format="percent"
              onClick={() => setSelectedCard({
                title: metric.label,
                description: "All-user percentage over time",
                valueLabel: "Current Value",
                displayValue: fmtPercent(metric.value),
                format: "percent",
                history: metric.history || [],
              })}
            />
          ))}
        </div>
      </div>

      {selectedCard && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setSelectedCard(null)}
          />
          <GraphModal
            item={selectedCard}
            onClose={() => setSelectedCard(null)}
          />
        </>
      )}
    </div>
  );
}
