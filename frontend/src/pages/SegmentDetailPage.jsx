import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import MetricCard from "../components/MetricCard";
import { getSegment } from "../api/client";
import { fmtDate, fmtInt, fmtPercent } from "../utils/format";

export default function SegmentDetailPage({ refreshToken = 0 }) {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [segment, setSegment] = useState(null);
  const [broadcasts, setBroadcasts] = useState([]);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoading(true);
        const response = await getSegment(id);
        if (!mounted) return;
        setSegment(response.segment);
        setBroadcasts(response.broadcasts || []);
        setUsers(response.users || []);
      } catch (err) {
        if (mounted) setError(err.message || "Failed to load segment");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    if (id) load();
    return () => {
      mounted = false;
    };
  }, [id, refreshToken]);

  if (loading) return <p className="text-sm text-slate-600">Loading segment...</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!segment) return <p className="text-sm text-slate-600">Segment not found.</p>;

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-lg font-semibold text-slate-900">{segment.name || segment.id}</h2>
        <p className="mt-1 text-xs text-slate-500">Created: {fmtDate(segment.created_at)}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <MetricCard label="Contacts" value={fmtInt(segment.total_contacts)} />
        <MetricCard label="Broadcasts" value={fmtInt(segment.total_broadcasts)} />
        <MetricCard label="Delivered" value={fmtInt(segment.total_delivered)} />
        <MetricCard label="Opened" value={fmtInt(segment.total_opened)} />
        <MetricCard label="Open Rate" value={fmtPercent(segment.open_rate)} />
        <MetricCard label="Click Rate" value={fmtPercent(segment.click_rate)} />
      </div>

      <div className="card">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Broadcasts in Segment</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="table-cell">Broadcast</th>
                <th className="table-cell">Delivered</th>
                <th className="table-cell">Opened</th>
                <th className="table-cell">Clicked</th>
                <th className="table-cell">Open Rate</th>
                <th className="table-cell">Click Rate</th>
              </tr>
            </thead>
            <tbody>
              {broadcasts.map((broadcast) => (
                <tr key={broadcast.id}>
                  <td className="table-cell">
                    <Link to={`/broadcasts/${broadcast.id}`}>{broadcast.name || broadcast.id}</Link>
                  </td>
                  <td className="table-cell">{fmtInt(broadcast.total_delivered)}</td>
                  <td className="table-cell">{fmtInt(broadcast.total_opened)}</td>
                  <td className="table-cell">{fmtInt(broadcast.total_clicked)}</td>
                  <td className="table-cell">{fmtPercent(broadcast.open_rate)}</td>
                  <td className="table-cell">{fmtPercent(broadcast.click_rate)}</td>
                </tr>
              ))}
              {broadcasts.length === 0 ? (
                <tr>
                  <td className="table-cell text-slate-500" colSpan={6}>
                    No broadcasts found for this segment.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Top Users</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="table-cell">Email</th>
                <th className="table-cell">Delivered</th>
                <th className="table-cell">Opened</th>
                <th className="table-cell">Clicked</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.email}>
                  <td className="table-cell">
                    <Link to={`/users/${encodeURIComponent(user.email)}`}>{user.email}</Link>
                  </td>
                  <td className="table-cell">{fmtInt(user.delivered)}</td>
                  <td className="table-cell">{fmtInt(user.opened)}</td>
                  <td className="table-cell">{fmtInt(user.clicked)}</td>
                </tr>
              ))}
              {users.length === 0 ? (
                <tr>
                  <td className="table-cell text-slate-500" colSpan={4}>
                    No users found for this segment.
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
