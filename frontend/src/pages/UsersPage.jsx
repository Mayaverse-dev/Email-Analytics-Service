import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { Users, Search, Loader2, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown, X, Tag } from "lucide-react";
import { getUsers, getSegments } from "../api/client";
import { fmtInt, fmtPercent } from "../utils/format";

const PAGE_SIZE = 50;

const SORTABLE_COLUMNS = [
  { key: "total_delivered", label: "Delivered" },
  { key: "open_rate", label: "Open Rate" },
  { key: "click_rate", label: "Click Rate" },
];

function SortIcon({ column, sortField, sortOrder }) {
  if (sortField !== column) {
    return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />;
  }
  return sortOrder === "asc"
    ? <ArrowUp className="ml-1 inline h-3 w-3" />
    : <ArrowDown className="ml-1 inline h-3 w-3" />;
}

function SegmentMultiSelect({ allSegments, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = allSegments.filter(
    (s) => s.name.toLowerCase().includes(search.toLowerCase())
  );

  function toggle(id) {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  const selectedNames = allSegments.filter((s) => selected.includes(s.id));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="input flex items-center gap-2 text-left"
        style={{ minWidth: "220px", minHeight: "38px" }}
      >
        <Tag className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
        {selected.length === 0 ? (
          <span style={{ color: "var(--text-muted)" }}>Filter by segments...</span>
        ) : (
          <span className="truncate text-sm" style={{ color: "var(--text-primary)" }}>
            {selected.length} segment{selected.length > 1 ? "s" : ""} selected
          </span>
        )}
      </button>

      {selected.length > 0 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onChange([]); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5"
          style={{ color: "var(--text-muted)" }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border shadow-lg"
          style={{ backgroundColor: "var(--bg-primary)", borderColor: "var(--border)" }}
        >
          <div className="border-b p-2" style={{ borderColor: "var(--border)" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search segments..."
              className="input w-full text-sm"
              autoFocus
            />
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {filtered.map((seg) => (
              <label
                key={seg.id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:opacity-80"
                style={{ color: "var(--text-primary)" }}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(seg.id)}
                  onChange={() => toggle(seg.id)}
                  className="rounded"
                />
                <span className="truncate">{seg.name}</span>
              </label>
            ))}
            {filtered.length === 0 && (
              <p className="px-2 py-3 text-center text-xs" style={{ color: "var(--text-muted)" }}>
                No segments found
              </p>
            )}
          </div>
        </div>
      )}

      {selectedNames.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {selectedNames.map((seg) => (
            <span
              key={seg.id}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
              style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
            >
              {seg.name}
              <button onClick={() => toggle(seg.id)} className="hover:opacity-70">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function UsersPage({ refreshToken = 0 }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [sortField, setSortField] = useState("total_delivered");
  const [sortOrder, setSortOrder] = useState("desc");
  const [allSegments, setAllSegments] = useState([]);
  const [selectedSegments, setSelectedSegments] = useState([]);

  useEffect(() => {
    getSegments({ limit: 500 })
      .then((res) => setAllSegments(res.data || []))
      .catch(() => {});
  }, [refreshToken]);

  async function load(currentQuery = "", currentPage = 0, sort = sortField, order = sortOrder, segs = selectedSegments) {
    setLoading(true);
    setError("");
    try {
      const params = {
        limit: PAGE_SIZE,
        offset: currentPage * PAGE_SIZE,
        q: currentQuery,
        sort,
        order,
      };
      if (segs.length > 0) {
        params.segments = segs.join(",");
      }
      const response = await getUsers(params);
      setUsers(response.data || []);
      setTotal(Number(response.total || 0));
    } catch (err) {
      setError(err.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(query.trim(), page, sortField, sortOrder, selectedSegments);
  }, [refreshToken, page, sortField, sortOrder, selectedSegments]);

  function handleSearch(event) {
    event.preventDefault();
    setPage(0);
    load(query.trim(), 0, sortField, sortOrder, selectedSegments);
  }

  function handleSort(column) {
    if (sortField === column) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(column);
      setSortOrder("desc");
    }
    setPage(0);
  }

  function handleSegmentChange(segs) {
    setSelectedSegments(segs);
    setPage(0);
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

        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <SegmentMultiSelect
            allSegments={allSegments}
            selected={selectedSegments}
            onChange={handleSegmentChange}
          />
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
                    {SORTABLE_COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        onClick={() => handleSort(col.key)}
                        className="cursor-pointer select-none"
                      >
                        {col.label}
                        <SortIcon column={col.key} sortField={sortField} sortOrder={sortOrder} />
                      </th>
                    ))}
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
                      <td className="table-cell">{fmtPercent(user.open_rate)}</td>
                      <td className="table-cell">{fmtPercent(user.click_rate)}</td>
                    </tr>
                  ))}
                  {users.length === 0 ? (
                    <tr>
                      <td
                        className="table-cell py-12 text-center"
                        style={{ color: "var(--text-muted)" }}
                        colSpan={4}
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
