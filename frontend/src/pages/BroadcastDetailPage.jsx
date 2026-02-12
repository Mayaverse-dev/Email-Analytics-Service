import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import MetricCard from "../components/MetricCard";
import { getBroadcast, getBroadcastRecipients } from "../api/client";
import { fmtDate, fmtInt, fmtPercent } from "../utils/format";

export default function BroadcastDetailPage() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [broadcast, setBroadcast] = useState(null);
  const [summary, setSummary] = useState(null);
  const [recipients, setRecipients] = useState([]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoading(true);
        const [broadcastRes, recipientsRes] = await Promise.all([
          getBroadcast(id),
          getBroadcastRecipients(id, { limit: 1000, offset: 0 })
        ]);

        if (!mounted) return;
        setBroadcast(broadcastRes.broadcast);
        setSummary(broadcastRes.summary);
        setRecipients(recipientsRes.data || []);
      } catch (err) {
        if (mounted) setError(err.message || "Failed to load broadcast details");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    if (id) load();
    return () => {
      mounted = false;
    };
  }, [id]);

  if (loading) return <p className="text-sm text-slate-600">Loading broadcast...</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!broadcast) return <p className="text-sm text-slate-600">Broadcast not found.</p>;

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-lg font-semibold text-slate-900">{broadcast.name || broadcast.id}</h2>
        <p className="mt-1 text-sm text-slate-600">{broadcast.subject || "-"}</p>
        <p className="mt-1 text-xs text-slate-500">Sent at: {fmtDate(broadcast.sent_at || broadcast.created_at)}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <MetricCard label="Sent" value={fmtInt(broadcast.total_sent)} />
        <MetricCard label="Delivered" value={fmtInt(broadcast.total_delivered)} />
        <MetricCard label="Opened" value={fmtInt(broadcast.total_opened)} />
        <MetricCard label="Clicked" value={fmtInt(broadcast.total_clicked)} />
        <MetricCard label="Open Rate" value={fmtPercent(broadcast.open_rate)} />
        <MetricCard label="Click Rate" value={fmtPercent(broadcast.click_rate)} />
      </div>

      {summary ? (
        <div className="card">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Recipient Summary</h3>
          <div className="grid gap-3 text-sm text-slate-700 md:grid-cols-4">
            <p>Total recipients: {fmtInt(summary.total_recipients)}</p>
            <p>Delivered recipients: {fmtInt(summary.delivered_recipients)}</p>
            <p>Opened recipients: {fmtInt(summary.opened_recipients)}</p>
            <p>Clicked recipients: {fmtInt(summary.clicked_recipients)}</p>
          </div>
        </div>
      ) : null}

      <div className="card">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Recipients</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="table-cell">Email</th>
                <th className="table-cell">Delivered</th>
                <th className="table-cell">Opened</th>
                <th className="table-cell">Clicked</th>
                <th className="table-cell">Open Count</th>
                <th className="table-cell">Click Count</th>
                <th className="table-cell">Last Event</th>
              </tr>
            </thead>
            <tbody>
              {recipients.map((row) => (
                <tr key={row.id}>
                  <td className="table-cell">{row.email_address || "-"}</td>
                  <td className="table-cell">{row.delivered_at ? "Yes" : "No"}</td>
                  <td className="table-cell">{row.opened_at ? "Yes" : "No"}</td>
                  <td className="table-cell">{row.clicked_at ? "Yes" : "No"}</td>
                  <td className="table-cell">{fmtInt(row.open_count)}</td>
                  <td className="table-cell">{fmtInt(row.click_count)}</td>
                  <td className="table-cell">{fmtDate(row.last_event_at || row.sent_at)}</td>
                </tr>
              ))}
              {recipients.length === 0 ? (
                <tr>
                  <td className="table-cell text-slate-500" colSpan={7}>
                    No recipients found.
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
