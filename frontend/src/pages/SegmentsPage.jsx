import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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

  if (loading) return <p className="text-sm text-slate-600">Loading segments...</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="card">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">Segment Analytics</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th className="table-cell">Segment</th>
              <th className="table-cell">Contacts</th>
              <th className="table-cell">Broadcasts</th>
              <th className="table-cell">Delivered</th>
              <th className="table-cell">Opened</th>
              <th className="table-cell">Clicked</th>
              <th className="table-cell">Open Rate</th>
              <th className="table-cell">Click Rate</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((segment) => (
              <tr key={segment.id}>
                <td className="table-cell">
                  <Link to={`/segments/${segment.id}`} className="font-medium">
                    {segment.name || segment.id}
                  </Link>
                </td>
                <td className="table-cell">{fmtInt(segment.total_contacts)}</td>
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
                <td className="table-cell text-slate-500" colSpan={8}>
                  No segments found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
