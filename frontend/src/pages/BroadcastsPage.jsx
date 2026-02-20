import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Radio, Clock, Loader2 } from "lucide-react";
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
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-xl"
          style={{ backgroundColor: "var(--bg-tertiary)" }}
        >
          <Radio className="h-6 w-6" style={{ color: "var(--accent)" }} />
        </div>
        <div>
          <h1 className="page-title">Broadcasts</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {data.length} total broadcasts
          </p>
        </div>
      </div>

      <div className="card p-0">
        <div className="table-container border-0">
          <table className="min-w-full">
            <thead className="table-header">
              <tr>
                <th>Broadcast</th>
                <th>Status</th>
                <th>Sent</th>
                <th>Delivered</th>
                <th>Opened</th>
                <th>Clicked</th>
                <th>Open Rate</th>
                <th>Click Rate</th>
                <th>Sent At</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id} className="table-row">
                  <td className="table-cell">
                    <Link to={`/broadcasts/${row.id}`} className="link font-medium">
                      {row.name || row.id}
                    </Link>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                      {row.subject || "-"}
                    </p>
                  </td>
                  <td className="table-cell">
                    <span
                      className={`badge ${
                        row.status === "sent" || row.status === "completed"
                          ? "badge-success"
                          : row.status === "draft"
                            ? "badge-info"
                            : "badge-warning"
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="table-cell font-medium" style={{ color: "var(--text-primary)" }}>
                    {fmtInt(row.total_sent)}
                  </td>
                  <td className="table-cell">{fmtInt(row.total_delivered)}</td>
                  <td className="table-cell">{fmtInt(row.total_opened)}</td>
                  <td className="table-cell">{fmtInt(row.total_clicked)}</td>
                  <td className="table-cell">{fmtPercent(row.open_rate)}</td>
                  <td className="table-cell">{fmtPercent(row.click_rate)}</td>
                  <td className="table-cell">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
                      {fmtDate(row.sent_at || row.created_at)}
                    </div>
                  </td>
                </tr>
              ))}
              {data.length === 0 ? (
                <tr>
                  <td
                    className="table-cell py-12 text-center"
                    style={{ color: "var(--text-muted)" }}
                    colSpan={9}
                  >
                    No broadcasts available.
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
