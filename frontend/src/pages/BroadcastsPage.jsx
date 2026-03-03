import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Radio, Clock, Loader2, Search, ChevronLeft, ChevronRight, X, MailOpen, Send, MousePointerClick } from "lucide-react";
import { getBroadcasts, getBroadcast } from "../api/client";
import { fmtDate, fmtInt, fmtPercent } from "../utils/format";
import MetricCard from "../components/MetricCard";

const PAGE_SIZE = 50;

function SidePanel({ broadcastId, onClose }) {
  const [loading, setLoading] = useState(true);
  const [broadcast, setBroadcast] = useState(null);
  const [error, setError] = useState("");
  const [contentView, setContentView] = useState("html");

  useEffect(() => {
    if (!broadcastId) return;
    let mounted = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await getBroadcast(broadcastId);
        if (mounted) setBroadcast(res.broadcast);
      } catch (err) {
        if (mounted) setError(err.message || "Failed to load");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [broadcastId]);

  return (
    <div
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col shadow-2xl"
      style={{ backgroundColor: "var(--bg-primary)", borderLeft: "1px solid var(--border)" }}
    >
      <div
        className="flex items-center justify-between border-b px-6 py-4"
        style={{ borderColor: "var(--border)" }}
      >
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          {loading ? "Loading..." : broadcast?.subject || "Broadcast"}
        </h2>
        <button onClick={onClose} className="btn-ghost p-1.5">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--accent)" }} />
          </div>
        )}
        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
        {!loading && broadcast && (
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                <span className="font-medium">From:</span> {broadcast.from_address || "—"}
              </p>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                <span className="font-medium">Sent:</span> {fmtDate(broadcast.sent_at || broadcast.created_at)}
              </p>
              {broadcast.preview_text && (
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  <span className="font-medium">Preview:</span> {broadcast.preview_text}
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <MetricCard label="Sent" value={fmtInt(broadcast.total_sent)} icon={Send} compact />
              <MetricCard label="Opened" value={fmtInt(broadcast.total_opened)} icon={MailOpen} compact />
              <MetricCard label="Clicked" value={fmtInt(broadcast.total_clicked)} icon={MousePointerClick} compact />
              <MetricCard label="Open Rate" value={fmtPercent(broadcast.open_rate)} compact />
              <MetricCard label="Click Rate" value={fmtPercent(broadcast.click_rate)} compact />
              <MetricCard label="Delivered" value={fmtInt(broadcast.total_delivered)} compact />
            </div>

            {(broadcast.html_content || broadcast.text_content) && (
              <div>
                <div className="mb-3 flex gap-2">
                  {broadcast.html_content && (
                    <button
                      onClick={() => setContentView("html")}
                      className={`rounded px-3 py-1 text-xs font-medium ${
                        contentView === "html" ? "btn-primary" : "btn-secondary"
                      }`}
                    >
                      HTML Preview
                    </button>
                  )}
                  {broadcast.text_content && (
                    <button
                      onClick={() => setContentView("text")}
                      className={`rounded px-3 py-1 text-xs font-medium ${
                        contentView === "text" ? "btn-primary" : "btn-secondary"
                      }`}
                    >
                      Plain Text
                    </button>
                  )}
                  {broadcast.html_content && (
                    <button
                      onClick={() => setContentView("source")}
                      className={`rounded px-3 py-1 text-xs font-medium ${
                        contentView === "source" ? "btn-primary" : "btn-secondary"
                      }`}
                    >
                      HTML Source
                    </button>
                  )}
                </div>
                {contentView === "html" && broadcast.html_content && (
                  <div className="rounded border" style={{ borderColor: "var(--border)" }}>
                    <iframe
                      srcDoc={broadcast.html_content}
                      title="Email Preview"
                      className="h-[500px] w-full rounded border-0"
                      sandbox="allow-same-origin"
                      style={{ backgroundColor: "#fff" }}
                    />
                  </div>
                )}
                {contentView === "text" && broadcast.text_content && (
                  <pre
                    className="max-h-[500px] overflow-auto whitespace-pre-wrap rounded border p-4 text-sm"
                    style={{
                      borderColor: "var(--border)",
                      backgroundColor: "var(--bg-secondary)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {broadcast.text_content}
                  </pre>
                )}
                {contentView === "source" && broadcast.html_content && (
                  <pre
                    className="max-h-[500px] overflow-auto whitespace-pre-wrap rounded border p-4 text-xs"
                    style={{
                      borderColor: "var(--border)",
                      backgroundColor: "var(--bg-secondary)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {broadcast.html_content}
                  </pre>
                )}
              </div>
            )}
            {!broadcast.html_content && !broadcast.text_content && (
              <p className="py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                No email content available for this broadcast.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function BroadcastsPage({ refreshToken = 0 }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  async function load(currentQuery = "", currentPage = 0) {
    setLoading(true);
    setError("");
    try {
      const response = await getBroadcasts({
        limit: PAGE_SIZE,
        offset: currentPage * PAGE_SIZE,
        q: currentQuery,
      });
      setData(response.data || []);
      setTotal(Number(response.total || 0));
    } catch (err) {
      setError(err.message || "Failed to load broadcasts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(query.trim(), page);
  }, [refreshToken, page]);

  function handleSearch(event) {
    event.preventDefault();
    setPage(0);
    load(query.trim(), 0);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
              {fmtInt(total)} total broadcasts
            </p>
          </div>
        </div>

        <form className="flex gap-2" onSubmit={handleSearch}>
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or subject..."
              className="input pl-10"
              style={{ minWidth: "260px" }}
            />
          </div>
          <button type="submit" className="btn-primary">
            Search
          </button>
        </form>
      </div>

      {error ? (
        <div className="card border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/20">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--accent)" }} />
        </div>
      ) : !error ? (
        <>
          <div className="card p-0">
            <div className="table-container border-0">
              <table className="min-w-full">
                <thead className="table-header">
                  <tr>
                    <th>Broadcast</th>
                    <th>Segment</th>
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
                    <tr
                      key={row.id}
                      className="table-row cursor-pointer"
                      onClick={() => setSelectedId(row.id)}
                      style={
                        selectedId === row.id
                          ? { backgroundColor: "var(--bg-tertiary)" }
                          : undefined
                      }
                    >
                      <td className="table-cell">
                        <span className="font-medium" style={{ color: "var(--accent)" }}>
                          {row.subject || row.name || row.id}
                        </span>
                      </td>
                      <td className="table-cell">
                        {row.segment_name ? (
                          <Link
                            to={`/segments/${row.segment_id}`}
                            className="link text-xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {row.segment_name}
                          </Link>
                        ) : (
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>—</span>
                        )}
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
                        No broadcasts found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          {total > PAGE_SIZE ? (
            <div className="flex items-center justify-between">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Showing {fmtInt(from)}–{fmtInt(to)} of {fmtInt(total)}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="btn-secondary"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </button>
                <span
                  className="px-3 text-sm font-medium"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {page + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="btn-secondary"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {selectedId && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setSelectedId(null)}
          />
          <SidePanel
            broadcastId={selectedId}
            onClose={() => setSelectedId(null)}
          />
        </>
      )}
    </div>
  );
}
