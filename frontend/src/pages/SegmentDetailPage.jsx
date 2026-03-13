import { useEffect, useState, useMemo } from "react";
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

function MembersTable({ users, members }) {
  const merged = useMemo(() => {
    const byEmail = new Map();

    for (const m of members) {
      byEmail.set(m.email, {
        email: m.email,
        first_name: m.first_name || null,
        delivered: m.total_delivered || 0,
        opened: m.total_opened || 0,
        clicked: m.total_clicked || 0,
        open_rate: m.open_rate || 0,
        click_rate: m.click_rate || 0,
        source: m.source || "kit",
      });
    }

    for (const u of users) {
      const existing = byEmail.get(u.email);
      if (existing) {
        existing.delivered = Math.max(existing.delivered, u.delivered || 0);
        existing.opened = Math.max(existing.opened, u.opened || 0);
        existing.clicked = Math.max(existing.clicked, u.clicked || 0);
        if (u.delivered > 0) {
          existing.open_rate = existing.delivered > 0
            ? (existing.opened / existing.delivered) * 100 : 0;
          existing.click_rate = existing.delivered > 0
            ? (existing.clicked / existing.delivered) * 100 : 0;
        }
      } else {
        byEmail.set(u.email, {
          email: u.email,
          first_name: null,
          delivered: u.delivered || 0,
          opened: u.opened || 0,
          clicked: u.clicked || 0,
          open_rate: u.delivered ? ((u.opened || 0) / u.delivered) * 100 : 0,
          click_rate: u.delivered ? ((u.clicked || 0) / u.delivered) * 100 : 0,
          source: "resend",
        });
      }
    }

    return Array.from(byEmail.values()).sort((a, b) => b.delivered - a.delivered);
  }, [users, members]);

  return (
    <div className="card">
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg"
          style={{ backgroundColor: "var(--bg-tertiary)" }}
        >
          <Users className="h-5 w-5" style={{ color: "var(--accent)" }} />
        </div>
        <div>
          <h2 className="section-title">Members</h2>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {merged.length} contacts in this segment
          </p>
        </div>
      </div>

      <div className="table-container mt-4">
        <table className="min-w-full">
          <thead className="table-header">
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Delivered</th>
              <th>Opened</th>
              <th>Clicked</th>
              <th>Open Rate</th>
              <th>Click Rate</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {merged.map((m) => (
              <tr key={m.email} className="table-row">
                <td className="table-cell">
                  <Link to={`/users/${encodeURIComponent(m.email)}`} className="link">
                    {m.email}
                  </Link>
                </td>
                <td className="table-cell">{m.first_name || "-"}</td>
                <td className="table-cell font-medium" style={{ color: "var(--text-primary)" }}>
                  {fmtInt(m.delivered)}
                </td>
                <td className="table-cell">{fmtInt(m.opened)}</td>
                <td className="table-cell">{fmtInt(m.clicked)}</td>
                <td className="table-cell">{fmtPercent(m.open_rate)}</td>
                <td className="table-cell">{fmtPercent(m.click_rate)}</td>
                <td className="table-cell">
                  <span
                    className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor: "var(--bg-tertiary)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {m.source}
                  </span>
                </td>
              </tr>
            ))}
            {merged.length === 0 ? (
              <tr>
                <td
                  className="table-cell py-8 text-center"
                  style={{ color: "var(--text-muted)" }}
                  colSpan={8}
                >
                  No members found for this segment.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SegmentDetailPage({ refreshToken = 0 }) {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [segment, setSegment] = useState(null);
  const [broadcasts, setBroadcasts] = useState([]);
  const [users, setUsers] = useState([]);
  const [members, setMembers] = useState([]);

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
        setMembers(response.members || []);
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
            <h1 className="page-title">{segment.display_name || segment.name || segment.id}</h1>
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

      <MembersTable users={users} members={members} />
    </div>
  );
}
