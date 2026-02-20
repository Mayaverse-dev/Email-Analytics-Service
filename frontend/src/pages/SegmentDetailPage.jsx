import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Layers,
  Users,
  Radio,
  Send,
  MailOpen,
  ArrowLeft,
  Clock,
  Loader2
} from "lucide-react";
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

  if (!segment) {
    return (
      <div className="card">
        <p style={{ color: "var(--text-muted)" }}>Segment not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/segments" className="btn-ghost inline-flex">
        <ArrowLeft className="h-4 w-4" />
        Back to Segments
      </Link>

      <div className="card">
        <div className="flex items-center gap-4">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full"
            style={{ backgroundColor: "var(--bg-tertiary)" }}
          >
            <Layers className="h-7 w-7" style={{ color: "var(--accent)" }} />
          </div>
          <div>
            <h1 className="page-title">{segment.name || segment.id}</h1>
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              <Clock className="mr-1 inline h-3 w-3" />
              Created: {fmtDate(segment.created_at)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Contacts" value={fmtInt(segment.total_contacts)} icon={Users} />
        <MetricCard label="Broadcasts" value={fmtInt(segment.total_broadcasts)} icon={Radio} />
        <MetricCard label="Delivered" value={fmtInt(segment.total_delivered)} icon={Send} />
        <MetricCard label="Opened" value={fmtInt(segment.total_opened)} icon={MailOpen} />
        <MetricCard label="Open Rate" value={fmtPercent(segment.open_rate)} icon={MailOpen} />
        <MetricCard label="Click Rate" value={fmtPercent(segment.click_rate)} icon={MailOpen} />
      </div>

      <div className="card">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: "var(--bg-tertiary)" }}
          >
            <Radio className="h-5 w-5" style={{ color: "var(--accent)" }} />
          </div>
          <div>
            <h2 className="section-title">Broadcasts in Segment</h2>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {broadcasts.length} broadcasts
            </p>
          </div>
        </div>

        <div className="table-container mt-4">
          <table className="min-w-full">
            <thead className="table-header">
              <tr>
                <th>Broadcast</th>
                <th>Delivered</th>
                <th>Opened</th>
                <th>Clicked</th>
                <th>Open Rate</th>
                <th>Click Rate</th>
              </tr>
            </thead>
            <tbody>
              {broadcasts.map((broadcast) => (
                <tr key={broadcast.id} className="table-row">
                  <td className="table-cell">
                    <Link to={`/broadcasts/${broadcast.id}`} className="link">
                      {broadcast.name || broadcast.id}
                    </Link>
                  </td>
                  <td className="table-cell font-medium" style={{ color: "var(--text-primary)" }}>
                    {fmtInt(broadcast.total_delivered)}
                  </td>
                  <td className="table-cell">{fmtInt(broadcast.total_opened)}</td>
                  <td className="table-cell">{fmtInt(broadcast.total_clicked)}</td>
                  <td className="table-cell">{fmtPercent(broadcast.open_rate)}</td>
                  <td className="table-cell">{fmtPercent(broadcast.click_rate)}</td>
                </tr>
              ))}
              {broadcasts.length === 0 ? (
                <tr>
                  <td
                    className="table-cell py-8 text-center"
                    style={{ color: "var(--text-muted)" }}
                    colSpan={6}
                  >
                    No broadcasts found for this segment.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: "var(--bg-tertiary)" }}
          >
            <Users className="h-5 w-5" style={{ color: "var(--accent)" }} />
          </div>
          <div>
            <h2 className="section-title">Top Users</h2>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Most engaged users in this segment
            </p>
          </div>
        </div>

        <div className="table-container mt-4">
          <table className="min-w-full">
            <thead className="table-header">
              <tr>
                <th>Email</th>
                <th>Delivered</th>
                <th>Opened</th>
                <th>Clicked</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.email} className="table-row">
                  <td className="table-cell">
                    <Link to={`/users/${encodeURIComponent(user.email)}`} className="link">
                      {user.email}
                    </Link>
                  </td>
                  <td className="table-cell font-medium" style={{ color: "var(--text-primary)" }}>
                    {fmtInt(user.delivered)}
                  </td>
                  <td className="table-cell">{fmtInt(user.opened)}</td>
                  <td className="table-cell">{fmtInt(user.clicked)}</td>
                </tr>
              ))}
              {users.length === 0 ? (
                <tr>
                  <td
                    className="table-cell py-8 text-center"
                    style={{ color: "var(--text-muted)" }}
                    colSpan={4}
                  >
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
