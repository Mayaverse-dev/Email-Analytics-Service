import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getUsers } from "../api/client";
import { fmtInt, fmtPercent } from "../utils/format";

export default function UsersPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);

  async function load(currentQuery = "") {
    setLoading(true);
    setError("");
    try {
      const response = await getUsers({ limit: 1000, offset: 0, q: currentQuery });
      setUsers(response.data || []);
    } catch (err) {
      setError(err.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="card space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <h2 className="text-lg font-semibold text-slate-900">User Analytics</h2>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            load(query.trim());
          }}
        >
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by email"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white">
            Search
          </button>
        </form>
      </div>

      {loading ? <p className="text-sm text-slate-600">Loading users...</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {!loading && !error ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="table-cell">Email</th>
                <th className="table-cell">Delivered</th>
                <th className="table-cell">Opened</th>
                <th className="table-cell">Clicked</th>
                <th className="table-cell">Open Rate</th>
                <th className="table-cell">Click Rate</th>
                <th className="table-cell">Unsubscribed</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.email}>
                  <td className="table-cell">
                    <Link to={`/users/${encodeURIComponent(user.email)}`} className="font-medium">
                      {user.email}
                    </Link>
                  </td>
                  <td className="table-cell">{fmtInt(user.total_delivered)}</td>
                  <td className="table-cell">{fmtInt(user.total_opened)}</td>
                  <td className="table-cell">{fmtInt(user.total_clicked)}</td>
                  <td className="table-cell">{fmtPercent(user.open_rate)}</td>
                  <td className="table-cell">{fmtPercent(user.click_rate)}</td>
                  <td className="table-cell">{user.unsubscribed ? "Yes" : "No"}</td>
                </tr>
              ))}
              {users.length === 0 ? (
                <tr>
                  <td className="table-cell text-slate-500" colSpan={7}>
                    No users found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
