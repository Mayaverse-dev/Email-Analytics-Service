import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  User,
  Send,
  MailOpen,
  MousePointerClick,
  ArrowLeft,
  Clock,
  Loader2,
  CheckCircle2,
  XCircle
} from "lucide-react";
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

  if (!user) {
    return (
      <div className="card">
        <p style={{ color: "var(--text-muted)" }}>User not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/users" className="btn-ghost inline-flex">
        <ArrowLeft className="h-4 w-4" />
        Back to Users
      </Link>

      <div className="card">
        <div className="flex items-center gap-4">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full"
            style={{ backgroundColor: "var(--bg-tertiary)" }}
          >
            <User className="h-7 w-7" style={{ color: "var(--accent)" }} />
          </div>
          <div>
            <h1 className="page-title">{user.email}</h1>
            {(user.first_name || user.last_name) && (
              <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                {user.first_name || ""} {user.last_name || ""}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Sent" value={fmtInt(user.total_sent)} icon={Send} />
        <MetricCard label="Delivered" value={fmtInt(user.total_delivered)} icon={Send} />
        <MetricCard label="Opened" value={fmtInt(user.total_opened)} icon={MailOpen} />
        <MetricCard label="Clicked" value={fmtInt(user.total_clicked)} icon={MousePointerClick} />
        <MetricCard label="Open Rate" value={fmtPercent(user.open_rate)} icon={MailOpen} />
        <MetricCard label="Click Rate" value={fmtPercent(user.click_rate)} icon={MousePointerClick} />
      </div>

      <div className="card">
        <h2 className="section-title">Broadcast History</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Email interactions for this user
        </p>

        <div className="table-container mt-4">
          <table className="min-w-full">
            <thead className="table-header">
              <tr>
                <th>Broadcast</th>
                <th>Delivered</th>
                <th>Opened</th>
                <th>Clicked</th>
                <th>Open Count</th>
                <th>Click Count</th>
                <th>Last Event</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={`${row.broadcast_id}:${row.email_id}`} className="table-row">
                  <td className="table-cell">
                    <Link to={`/broadcasts/${row.broadcast_id}`} className="link">
                      {row.broadcast_name || row.broadcast_id}
                    </Link>
                  </td>
                  <td className="table-cell">
                    {row.delivered_at ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <XCircle className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
                    )}
                  </td>
                  <td className="table-cell">
                    {row.opened_at ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <XCircle className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
                    )}
                  </td>
                  <td className="table-cell">
                    {row.clicked_at ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <XCircle className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
                    )}
                  </td>
                  <td className="table-cell font-medium" style={{ color: "var(--text-primary)" }}>
                    {fmtInt(row.open_count)}
                  </td>
                  <td className="table-cell font-medium" style={{ color: "var(--text-primary)" }}>
                    {fmtInt(row.click_count)}
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
                      {fmtDate(row.last_event_at || row.sent_at)}
                    </div>
                  </td>
                </tr>
              ))}
              {history.length === 0 ? (
                <tr>
                  <td
                    className="table-cell py-12 text-center"
                    style={{ color: "var(--text-muted)" }}
                    colSpan={7}
                  >
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
