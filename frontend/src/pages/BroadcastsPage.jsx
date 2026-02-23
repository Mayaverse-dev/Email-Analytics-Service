import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Radio, Clock, Loader2, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { getBroadcasts } from "../api/client";
import { fmtDate, fmtInt, fmtPercent } from "../utils/format";

const PAGE_SIZE = 50;

export default function BroadcastsPage({ refreshToken = 0 }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");

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
    </div>
  );
}
