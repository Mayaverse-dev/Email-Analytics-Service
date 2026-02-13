import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getBroadcasts } from "../api/client";
import { fmtDate, fmtInt, fmtPercent } from "../utils/format";

export default function BroadcastsPage({ refreshToken = 0 }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState([]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoading(true);
        const response = await getBroadcasts({ limit: 500, offset: 0 });
        if (mounted) setData(response.data || []);
      } catch (err) {
        if (mounted) setError(err.message || "Failed to load broadcasts");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [refreshToken]);

  if (loading) return <p className="text-sm text-slate-600">Loading broadcasts...</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="card">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">Broadcast Analytics</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th className="table-cell">Broadcast</th>
              <th className="table-cell">Status</th>
              <th className="table-cell">Sent</th>
              <th className="table-cell">Delivered</th>
              <th className="table-cell">Opened</th>
              <th className="table-cell">Clicked</th>
              <th className="table-cell">Open Rate</th>
              <th className="table-cell">Click Rate</th>
              <th className="table-cell">Sent At</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.id}>
                <td className="table-cell">
                  <Link to={`/broadcasts/${row.id}`} className="font-medium">
                    {row.name || row.id}
                  </Link>
                  <p className="text-xs text-slate-500">{row.subject || "-"}</p>
                </td>
                <td className="table-cell">{row.status}</td>
                <td className="table-cell">{fmtInt(row.total_sent)}</td>
                <td className="table-cell">{fmtInt(row.total_delivered)}</td>
                <td className="table-cell">{fmtInt(row.total_opened)}</td>
                <td className="table-cell">{fmtInt(row.total_clicked)}</td>
                <td className="table-cell">{fmtPercent(row.open_rate)}</td>
                <td className="table-cell">{fmtPercent(row.click_rate)}</td>
                <td className="table-cell">{fmtDate(row.sent_at || row.created_at)}</td>
              </tr>
            ))}
            {data.length === 0 ? (
              <tr>
                <td className="table-cell text-slate-500" colSpan={9}>
                  No broadcasts available.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
