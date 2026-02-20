import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Layers, Loader2 } from "lucide-react";
import { getSegments } from "../api/client";
import { fmtInt, fmtPercent } from "../utils/format";

export default function SegmentsPage({ refreshToken = 0 }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [segments, setSegments] = useState([]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoading(true);
        const response = await getSegments({ limit: 500, offset: 0 });
        if (mounted) setSegments(response.data || []);
      } catch (err) {
        if (mounted) setError(err.message || "Failed to load segments");
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
          <Layers className="h-6 w-6" style={{ color: "var(--accent)" }} />
        </div>
        <div>
          <h1 className="page-title">Segments</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {segments.length} total segments
          </p>
        </div>
      </div>

      <div className="card p-0">
        <div className="table-container border-0">
          <table className="min-w-full">
            <thead className="table-header">
              <tr>
                <th>Segment</th>
                <th>Contacts</th>
                <th>Broadcasts</th>
                <th>Delivered</th>
                <th>Opened</th>
                <th>Clicked</th>
                <th>Open Rate</th>
                <th>Click Rate</th>
              </tr>
            </thead>
            <tbody>
              {segments.map((segment) => (
                <tr key={segment.id} className="table-row">
                  <td className="table-cell">
                    <Link to={`/segments/${segment.id}`} className="link font-medium">
                      {segment.name || segment.id}
                    </Link>
                  </td>
                  <td className="table-cell font-medium" style={{ color: "var(--text-primary)" }}>
                    {fmtInt(segment.total_contacts)}
                  </td>
                  <td className="table-cell">{fmtInt(segment.total_broadcasts)}</td>
                  <td className="table-cell">{fmtInt(segment.total_delivered)}</td>
                  <td className="table-cell">{fmtInt(segment.total_opened)}</td>
                  <td className="table-cell">{fmtInt(segment.total_clicked)}</td>
                  <td className="table-cell">{fmtPercent(segment.open_rate)}</td>
                  <td className="table-cell">{fmtPercent(segment.click_rate)}</td>
                </tr>
              ))}
              {segments.length === 0 ? (
                <tr>
                  <td
                    className="table-cell py-12 text-center"
                    style={{ color: "var(--text-muted)" }}
                    colSpan={8}
                  >
                    No segments found.
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
