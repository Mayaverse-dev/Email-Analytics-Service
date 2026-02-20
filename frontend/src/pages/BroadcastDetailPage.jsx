import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Radio,
  Send,
  MailOpen,
  MousePointerClick,
  ArrowLeft,
  Clock,
  Loader2,
  Eye,
  EyeOff,
  FileText,
  Code,
  CheckCircle2,
  XCircle,
  Users
} from "lucide-react";
import MetricCard from "../components/MetricCard";
import { getBroadcast, getBroadcastRecipients } from "../api/client";
import { fmtDate, fmtInt, fmtPercent } from "../utils/format";

export default function BroadcastDetailPage({ refreshToken = 0 }) {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [broadcast, setBroadcast] = useState(null);
  const [summary, setSummary] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [showContent, setShowContent] = useState(false);
  const [contentView, setContentView] = useState("html");

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

  if (!broadcast) {
    return (
      <div className="card">
        <p style={{ color: "var(--text-muted)" }}>Broadcast not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/broadcasts" className="btn-ghost inline-flex">
        <ArrowLeft className="h-4 w-4" />
        Back to Broadcasts
      </Link>

      <div className="card">
        <div className="flex items-center gap-4">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full"
            style={{ backgroundColor: "var(--bg-tertiary)" }}
          >
            <Radio className="h-7 w-7" style={{ color: "var(--accent)" }} />
          </div>
          <div className="flex-1">
            <h1 className="page-title">{broadcast.name || broadcast.id}</h1>
            <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
              {broadcast.subject || "-"}
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              <Clock className="mr-1 inline h-3 w-3" />
              Sent at: {fmtDate(broadcast.sent_at || broadcast.created_at)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Sent" value={fmtInt(broadcast.total_sent)} icon={Send} />
        <MetricCard label="Delivered" value={fmtInt(broadcast.total_delivered)} icon={Send} />
        <MetricCard label="Opened" value={fmtInt(broadcast.total_opened)} icon={MailOpen} />
        <MetricCard label="Clicked" value={fmtInt(broadcast.total_clicked)} icon={MousePointerClick} />
        <MetricCard label="Open Rate" value={fmtPercent(broadcast.open_rate)} icon={MailOpen} />
        <MetricCard label="Click Rate" value={fmtPercent(broadcast.click_rate)} icon={MousePointerClick} />
      </div>

      {(broadcast.html_content || broadcast.text_content) ? (
        <div className="card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ backgroundColor: "var(--bg-tertiary)" }}
              >
                <FileText className="h-5 w-5" style={{ color: "var(--accent)" }} />
              </div>
              <div>
                <h2 className="section-title">Email Content</h2>
                {broadcast.preview_text && (
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {broadcast.preview_text}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={() => setShowContent(!showContent)}
              className="btn-secondary"
            >
              {showContent ? (
                <>
                  <EyeOff className="h-4 w-4" />
                  Hide
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4" />
                  Show
                </>
              )}
            </button>
          </div>

          {broadcast.reply_to && (
            <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
              <span className="font-medium">Reply-To:</span> {broadcast.reply_to}
            </p>
          )}

          {showContent && (
            <div className="mt-4">
              <div className="mb-4 flex gap-2">
                {broadcast.html_content && (
                  <button
                    onClick={() => setContentView("html")}
                    className={contentView === "html" ? "btn-primary" : "btn-secondary"}
                  >
                    <Eye className="h-4 w-4" />
                    Preview
                  </button>
                )}
                {broadcast.text_content && (
                  <button
                    onClick={() => setContentView("text")}
                    className={contentView === "text" ? "btn-primary" : "btn-secondary"}
                  >
                    <FileText className="h-4 w-4" />
                    Plain Text
                  </button>
                )}
                {broadcast.html_content && (
                  <button
                    onClick={() => setContentView("source")}
                    className={contentView === "source" ? "btn-primary" : "btn-secondary"}
                  >
                    <Code className="h-4 w-4" />
                    Source
                  </button>
                )}
              </div>

              {contentView === "html" && broadcast.html_content && (
                <div
                  className="overflow-hidden rounded-lg border"
                  style={{ borderColor: "var(--border-color)" }}
                >
                  <iframe
                    srcDoc={broadcast.html_content}
                    title="Email Preview"
                    className="h-[500px] w-full border-0 bg-white"
                    sandbox="allow-same-origin"
                  />
                </div>
              )}

              {contentView === "text" && broadcast.text_content && (
                <pre
                  className="max-h-[500px] overflow-auto whitespace-pre-wrap rounded-lg border p-4 text-sm"
                  style={{
                    borderColor: "var(--border-color)",
                    backgroundColor: "var(--bg-tertiary)",
                    color: "var(--text-secondary)"
                  }}
                >
                  {broadcast.text_content}
                </pre>
              )}

              {contentView === "source" && broadcast.html_content && (
                <pre
                  className="max-h-[500px] overflow-auto whitespace-pre-wrap rounded-lg border p-4 text-xs"
                  style={{
                    borderColor: "var(--border-color)",
                    backgroundColor: "var(--bg-tertiary)",
                    color: "var(--text-secondary)"
                  }}
                >
                  {broadcast.html_content}
                </pre>
              )}
            </div>
          )}
        </div>
      ) : null}

      {summary ? (
        <div className="card">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ backgroundColor: "var(--bg-tertiary)" }}
            >
              <Users className="h-5 w-5" style={{ color: "var(--accent)" }} />
            </div>
            <h2 className="section-title">Recipient Summary</h2>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div
              className="rounded-lg p-4"
              style={{ backgroundColor: "var(--bg-tertiary)" }}
            >
              <p className="text-xs font-medium uppercase" style={{ color: "var(--text-muted)" }}>
                Total Recipients
              </p>
              <p className="mt-1 text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                {fmtInt(summary.total_recipients)}
              </p>
            </div>
            <div
              className="rounded-lg p-4"
              style={{ backgroundColor: "var(--bg-tertiary)" }}
            >
              <p className="text-xs font-medium uppercase" style={{ color: "var(--text-muted)" }}>
                Delivered
              </p>
              <p className="mt-1 text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                {fmtInt(summary.delivered_recipients)}
              </p>
            </div>
            <div
              className="rounded-lg p-4"
              style={{ backgroundColor: "var(--bg-tertiary)" }}
            >
              <p className="text-xs font-medium uppercase" style={{ color: "var(--text-muted)" }}>
                Opened
              </p>
              <p className="mt-1 text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                {fmtInt(summary.opened_recipients)}
              </p>
            </div>
            <div
              className="rounded-lg p-4"
              style={{ backgroundColor: "var(--bg-tertiary)" }}
            >
              <p className="text-xs font-medium uppercase" style={{ color: "var(--text-muted)" }}>
                Clicked
              </p>
              <p className="mt-1 text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                {fmtInt(summary.clicked_recipients)}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: "var(--bg-tertiary)" }}
          >
            <Users className="h-5 w-5" style={{ color: "var(--accent)" }} />
          </div>
          <div>
            <h2 className="section-title">Recipients</h2>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {recipients.length} recipients
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
                <th>Open Count</th>
                <th>Click Count</th>
                <th>Last Event</th>
              </tr>
            </thead>
            <tbody>
              {recipients.map((row) => (
                <tr key={row.id} className="table-row">
                  <td className="table-cell font-medium" style={{ color: "var(--text-primary)" }}>
                    {row.email_address || "-"}
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
                  <td className="table-cell">{fmtInt(row.open_count)}</td>
                  <td className="table-cell">{fmtInt(row.click_count)}</td>
                  <td className="table-cell">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
                      {fmtDate(row.last_event_at || row.sent_at)}
                    </div>
                  </td>
                </tr>
              ))}
              {recipients.length === 0 ? (
                <tr>
                  <td
                    className="table-cell py-12 text-center"
                    style={{ color: "var(--text-muted)" }}
                    colSpan={7}
                  >
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
