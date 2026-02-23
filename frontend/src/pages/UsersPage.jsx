import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Users, Search, Loader2, UserX, ChevronLeft, ChevronRight } from "lucide-react";
import { getUsers } from "../api/client";
import { fmtInt, fmtPercent } from "../utils/format";

const PAGE_SIZE = 50;

export default function UsersPage({ refreshToken = 0 }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);

  async function load(currentQuery = "", currentPage = 0) {
    setLoading(true);
    setError("");
    try {
      const response = await getUsers({
        limit: PAGE_SIZE,
        offset: currentPage * PAGE_SIZE,
        q: currentQuery,
      });
      setUsers(response.data || []);
      setTotal(Number(response.total || 0));
    } catch (err) {
      setError(err.message || "Failed to load users");
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
            <Users className="h-6 w-6" style={{ color: "var(--accent)" }} />
          </div>
          <div>
            <h1 className="page-title">Users</h1>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {fmtInt(total)} total users
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
              placeholder="Search by email..."
              className="input pl-10"
              style={{ minWidth: "240px" }}
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
                    <th>Email</th>
                    <th>Delivered</th>
                    <th>Opened</th>
                    <th>Clicked</th>
                    <th>Open Rate</th>
                    <th>Click Rate</th>
                    <th>Unsubscribed</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.email} className="table-row">
                      <td className="table-cell">
                        <Link
                          to={`/users/${encodeURIComponent(user.email)}`}
                          className="link font-medium"
                        >
                          {user.email}
                        </Link>
                      </td>
                      <td className="table-cell font-medium" style={{ color: "var(--text-primary)" }}>
                        {fmtInt(user.total_delivered)}
                      </td>
                      <td className="table-cell">{fmtInt(user.total_opened)}</td>
                      <td className="table-cell">{fmtInt(user.total_clicked)}</td>
                      <td className="table-cell">{fmtPercent(user.open_rate)}</td>
                      <td className="table-cell">{fmtPercent(user.click_rate)}</td>
                      <td className="table-cell">
                        {user.unsubscribed ? (
                          <span className="badge badge-error">
                            <UserX className="mr-1 h-3 w-3" />
                            Yes
                          </span>
                        ) : (
                          <span className="badge badge-success">No</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 ? (
                    <tr>
                      <td
                        className="table-cell py-12 text-center"
                        style={{ color: "var(--text-muted)" }}
                        colSpan={7}
                      >
                        No users found.
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
