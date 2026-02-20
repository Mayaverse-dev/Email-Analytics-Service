import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Radio,
  Users,
  Layers,
  Send,
  MailOpen,
  MousePointerClick,
  Clock,
  ArrowRight,
  Activity,
  Loader2
} from "lucide-react";
import MetricCard from "../components/MetricCard";
import { getBroadcasts, getSegments, getSyncStatus, getUsers } from "../api/client";
import { fmtDate, fmtInt, fmtPercent } from "../utils/format";

export default function DashboardPage({ refreshToken = 0 }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState({
    broadcasts: [],
    totalBroadcasts: 0,
    totalUsers: 0,
    totalSegments: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    syncStatus: null
  });

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoading(true);
        const [broadcastsRes, usersRes, segmentsRes, syncStatusRes] = await Promise.all([
          getBroadcasts({ limit: 100, offset: 0 }),
          getUsers({ limit: 1, offset: 0 }),
          getSegments({ limit: 1, offset: 0 }),
          getSyncStatus()
        ]);

        if (!mounted) return;
        const delivered = broadcastsRes.data.reduce((acc, item) => acc + Number(item.total_delivered || 0), 0);
        const opened = broadcastsRes.data.reduce((acc, item) => acc + Number(item.total_opened || 0), 0);
        const clicked = broadcastsRes.data.reduce((acc, item) => acc + Number(item.total_clicked || 0), 0);

        setStats({
          broadcasts: broadcastsRes.data,
          totalBroadcasts: Number(broadcastsRes.total || 0),
          totalUsers: Number(usersRes.total || 0),
          totalSegments: Number(segmentsRes.total || 0),
          delivered,
          opened,
          clicked,
          syncStatus: syncStatusRes
        });
      } catch (err) {
        if (mounted) {
          setError(err.message || "Failed to load dashboard");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
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

  const openRate = stats.delivered ? (stats.opened / stats.delivered) * 100 : 0;
  const clickRate = stats.delivered ? (stats.clicked / stats.delivered) * 100 : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Overview of your email analytics
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Broadcasts" value={fmtInt(stats.totalBroadcasts)} icon={Radio} />
        <MetricCard label="Users" value={fmtInt(stats.totalUsers)} icon={Users} />
        <MetricCard label="Segments" value={fmtInt(stats.totalSegments)} icon={Layers} />
        <MetricCard label="Delivered" value={fmtInt(stats.delivered)} icon={Send} />
        <MetricCard label="Open Rate" value={fmtPercent(openRate)} icon={MailOpen} />
        <MetricCard label="Click Rate" value={fmtPercent(clickRate)} icon={MousePointerClick} />
      </div>

      <div className="card">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: "var(--bg-tertiary)" }}
          >
            <Activity className="h-5 w-5" style={{ color: "var(--accent)" }} />
          </div>
          <div>
            <h2 className="section-title">Last Sync</h2>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Synchronization status
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.syncStatus?.status === "never_synced" ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              No sync has run yet.
            </p>
          ) : (
            <>
              <div>
                <p className="text-xs font-medium uppercase" style={{ color: "var(--text-muted)" }}>
                  Status
                </p>
                <p className="mt-1 font-semibold" style={{ color: "var(--text-primary)" }}>
                  <span
                    className={`badge ${
                      stats.syncStatus?.status === "completed" ? "badge-success" : "badge-warning"
                    }`}
                  >
                    {stats.syncStatus?.status || "-"}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase" style={{ color: "var(--text-muted)" }}>
                  Started
                </p>
                <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                  {fmtDate(stats.syncStatus?.started_at)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase" style={{ color: "var(--text-muted)" }}>
                  Completed
                </p>
                <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                  {fmtDate(stats.syncStatus?.completed_at)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase" style={{ color: "var(--text-muted)" }}>
                  Events Processed
                </p>
                <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  {fmtInt(stats.syncStatus?.events_processed || 0)}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ backgroundColor: "var(--bg-tertiary)" }}
            >
              <Radio className="h-5 w-5" style={{ color: "var(--accent)" }} />
            </div>
            <div>
              <h2 className="section-title">Recent Broadcasts</h2>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Latest email campaigns
              </p>
            </div>
          </div>
          <Link to="/broadcasts" className="btn-ghost group">
            View all
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        <div className="table-container mt-4">
          <table className="min-w-full">
            <thead className="table-header">
              <tr>
                <th>Name</th>
                <th>Subject</th>
                <th>Delivered</th>
                <th>Open Rate</th>
                <th>Click Rate</th>
                <th>Sent At</th>
              </tr>
            </thead>
            <tbody>
              {stats.broadcasts.slice(0, 10).map((broadcast) => (
                <tr key={broadcast.id} className="table-row">
                  <td className="table-cell">
                    <Link to={`/broadcasts/${broadcast.id}`} className="link">
                      {broadcast.name || broadcast.id}
                    </Link>
                  </td>
                  <td className="table-cell">{broadcast.subject || "-"}</td>
                  <td className="table-cell font-medium" style={{ color: "var(--text-primary)" }}>
                    {fmtInt(broadcast.total_delivered)}
                  </td>
                  <td className="table-cell">{fmtPercent(broadcast.open_rate)}</td>
                  <td className="table-cell">{fmtPercent(broadcast.click_rate)}</td>
                  <td className="table-cell">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
                      {fmtDate(broadcast.sent_at || broadcast.created_at)}
                    </div>
                  </td>
                </tr>
              ))}
              {stats.broadcasts.length === 0 ? (
                <tr>
                  <td className="table-cell py-8 text-center" style={{ color: "var(--text-muted)" }} colSpan={6}>
                    No broadcasts yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
