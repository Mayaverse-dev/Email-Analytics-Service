import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import MetricCard from "../components/MetricCard";
import { getUser } from "../api/client";
import { fmtDate, fmtInt, fmtPercent } from "../utils/format";

export default function UserDetailPage({ refreshToken = 0 }) {
  const { email } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoading(true);
        const response = await getUser(email);
        if (!mounted) return;
        setUser(response.user);
        setHistory(response.history || []);
      } catch (err) {
        if (mounted) setError(err.message || "Failed to load user details");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    if (email) load();
    return () => {
      mounted = false;
    };
  }, [email, refreshToken]);

  if (loading) return <p className="text-sm text-slate-600">Loading user...</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!user) return <p className="text-sm text-slate-600">User not found.</p>;

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-lg font-semibold text-slate-900">{user.email}</h2>
        <p className="mt-1 text-sm text-slate-600">
          {user.first_name || ""} {user.last_name || ""}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <MetricCard label="Sent" value={fmtInt(user.total_sent)} />
        <MetricCard label="Delivered" value={fmtInt(user.total_delivered)} />
        <MetricCard label="Opened" value={fmtInt(user.total_opened)} />
        <MetricCard label="Clicked" value={fmtInt(user.total_clicked)} />
        <MetricCard label="Open Rate" value={fmtPercent(user.open_rate)} />
        <MetricCard label="Click Rate" value={fmtPercent(user.click_rate)} />
      </div>

      <div className="card">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Broadcast History</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="table-cell">Broadcast</th>
                <th className="table-cell">Delivered</th>
                <th className="table-cell">Opened</th>
                <th className="table-cell">Clicked</th>
                <th className="table-cell">Open Count</th>
                <th className="table-cell">Click Count</th>
                <th className="table-cell">Last Event</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={`${row.broadcast_id}:${row.email_id}`}>
                  <td className="table-cell">
                    <Link to={`/broadcasts/${row.broadcast_id}`}>{row.broadcast_name || row.broadcast_id}</Link>
                  </td>
                  <td className="table-cell">{row.delivered_at ? "Yes" : "No"}</td>
                  <td className="table-cell">{row.opened_at ? "Yes" : "No"}</td>
                  <td className="table-cell">{row.clicked_at ? "Yes" : "No"}</td>
                  <td className="table-cell">{fmtInt(row.open_count)}</td>
                  <td className="table-cell">{fmtInt(row.click_count)}</td>
                  <td className="table-cell">{fmtDate(row.last_event_at || row.sent_at)}</td>
                </tr>
              ))}
              {history.length === 0 ? (
                <tr>
                  <td className="table-cell text-slate-500" colSpan={7}>
                    No broadcast history for this user.
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
