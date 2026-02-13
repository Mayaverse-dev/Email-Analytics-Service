import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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

  if (loading) return <p className="text-sm text-slate-600">Loading dashboard...</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  const openRate = stats.delivered ? (stats.opened / stats.delivered) * 100 : 0;
  const clickRate = stats.delivered ? (stats.clicked / stats.delivered) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="Broadcasts" value={fmtInt(stats.totalBroadcasts)} />
        <MetricCard label="Users" value={fmtInt(stats.totalUsers)} />
        <MetricCard label="Segments" value={fmtInt(stats.totalSegments)} />
        <MetricCard label="Delivered" value={fmtInt(stats.delivered)} />
        <MetricCard label="Open Rate" value={fmtPercent(openRate)} />
        <MetricCard label="Click Rate" value={fmtPercent(clickRate)} />
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-900">Last Sync</h2>
        <div className="mt-2 text-sm text-slate-700">
          {stats.syncStatus?.status === "never_synced" ? (
            <p>No sync has run yet.</p>
          ) : (
            <>
              <p>Status: <span className="font-medium">{stats.syncStatus?.status || "-"}</span></p>
              <p>Started: {fmtDate(stats.syncStatus?.started_at)}</p>
              <p>Completed: {fmtDate(stats.syncStatus?.completed_at)}</p>
              <p>Events processed: {fmtInt(stats.syncStatus?.events_processed || 0)}</p>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Recent Broadcasts</h2>
          <Link to="/broadcasts" className="text-sm">
            View all
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="table-cell">Name</th>
                <th className="table-cell">Subject</th>
                <th className="table-cell">Delivered</th>
                <th className="table-cell">Open Rate</th>
                <th className="table-cell">Click Rate</th>
                <th className="table-cell">Sent At</th>
              </tr>
            </thead>
            <tbody>
              {stats.broadcasts.slice(0, 10).map((broadcast) => (
                <tr key={broadcast.id}>
                  <td className="table-cell">
                    <Link to={`/broadcasts/${broadcast.id}`}>{broadcast.name || broadcast.id}</Link>
                  </td>
                  <td className="table-cell">{broadcast.subject || "-"}</td>
                  <td className="table-cell">{fmtInt(broadcast.total_delivered)}</td>
                  <td className="table-cell">{fmtPercent(broadcast.open_rate)}</td>
                  <td className="table-cell">{fmtPercent(broadcast.click_rate)}</td>
                  <td className="table-cell">{fmtDate(broadcast.sent_at || broadcast.created_at)}</td>
                </tr>
              ))}
              {stats.broadcasts.length === 0 ? (
                <tr>
                  <td className="table-cell text-slate-500" colSpan={6}>
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
