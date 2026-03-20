import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  X,
  User,
  Send,
  MailOpen,
  MousePointerClick,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
} from "lucide-react";
import { getSegmentFolders, getSegments, getUser, getUsers } from "../api/client";
import { fmtDate, fmtInt, fmtPercent } from "../utils/format";
import MetricCard from "../components/MetricCard";

const PAGE_SIZE = 50;
const SEGMENT_PAGE_SIZE = 1000;

const SORTABLE_COLUMNS = [
  { key: "total_delivered", label: "Delivered" },
  { key: "open_rate", label: "Open Rate" },
  { key: "click_rate", label: "Click Rate" },
];

const CONNECTOR_OPTIONS = [
  { value: "union", label: "Union" },
  { value: "intersect", label: "Intersect" },
  { value: "exclude", label: "Exclude" },
];

const MODE_OPTIONS = [
  { value: "any", label: "ANY of" },
  { value: "all", label: "ALL of" },
];

const FILTER_STORAGE_KEY = "users-page-filter-state";

function makeEmptySlot() {
  return { mode: "any", segmentIds: [], connector: "union" };
}

function loadFilterState() {
  try {
    const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveFilterState(slots, appliedSlots, rootFolderIds) {
  try {
    window.localStorage.setItem(
      FILTER_STORAGE_KEY,
      JSON.stringify({ slots, appliedSlots, rootFolderIds }),
    );
  } catch { /* quota exceeded or private browsing */ }
}

function SortIcon({ column, sortField, sortOrder }) {
  if (sortField !== column) {
    return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />;
  }
  return sortOrder === "asc"
    ? <ArrowUp className="ml-1 inline h-3 w-3" />
    : <ArrowDown className="ml-1 inline h-3 w-3" />;
}

async function loadAllSegments() {
  const results = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (results.length < total) {
    const response = await getSegments({ limit: SEGMENT_PAGE_SIZE, offset });
    const batch = response.data || [];
    results.push(...batch);
    total = Number(response.total ?? batch.length);

    if (batch.length === 0 || batch.length < SEGMENT_PAGE_SIZE) {
      break;
    }
    offset += SEGMENT_PAGE_SIZE;
  }

  return results;
}

function getSegmentLabel(segment) {
  return segment.display_name || segment.name || segment.id;
}

/* ------------------------------------------------------------------ */
/*  SegmentMultiSelect                                                */
/* ------------------------------------------------------------------ */

function SegmentMultiSelect({ allSegments, selectedIds, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allSegments;
    return allSegments.filter((s) => getSegmentLabel(s).toLowerCase().includes(q));
  }, [allSegments, search]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  function toggle(segmentId) {
    if (selectedSet.has(segmentId)) {
      onChange(selectedIds.filter((id) => id !== segmentId));
    } else {
      onChange([...selectedIds, segmentId]);
    }
  }

  function remove(segmentId) {
    onChange(selectedIds.filter((id) => id !== segmentId));
  }

  const segmentById = useMemo(
    () => new Map(allSegments.map((s) => [s.id, s])),
    [allSegments],
  );

  return (
    <div ref={containerRef} className="relative flex-1">
      <div
        className="flex min-h-[38px] cursor-text flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1"
        style={{
          borderColor: open ? "var(--accent)" : "var(--border)",
          backgroundColor: "var(--bg-primary)",
        }}
        onClick={() => { setOpen(true); }}
      >
        {selectedIds.map((id) => {
          const seg = segmentById.get(id);
          return (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            >
              {seg ? getSegmentLabel(seg) : id}
              <button
                type="button"
                className="ml-0.5 hover:opacity-70"
                onClick={(e) => { e.stopPropagation(); remove(id); }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={selectedIds.length === 0 ? "Search segments..." : ""}
          className="min-w-[100px] flex-1 border-0 bg-transparent py-0.5 text-sm outline-none"
          style={{ color: "var(--text-primary)" }}
        />
      </div>

      {open && (
        <div
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border shadow-lg"
          style={{
            borderColor: "var(--border)",
            backgroundColor: "var(--bg-secondary)",
          }}
        >
          {filtered.length === 0 && (
            <div className="px-4 py-3 text-sm" style={{ color: "var(--text-muted)" }}>
              No segments found
            </div>
          )}
          {filtered.map((segment) => {
            const isSelected = selectedSet.has(segment.id);
            return (
              <button
                key={segment.id}
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:opacity-80"
                style={{
                  color: "var(--text-primary)",
                  backgroundColor: isSelected ? "var(--bg-tertiary)" : undefined,
                }}
                onClick={() => toggle(segment.id)}
              >
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded border"
                  style={{
                    borderColor: isSelected ? "var(--accent)" : "var(--border)",
                    backgroundColor: isSelected ? "var(--accent)" : "transparent",
                  }}
                >
                  {isSelected && (
                    <svg viewBox="0 0 12 12" className="h-3 w-3 text-white">
                      <path d="M2 6l3 3 5-5" fill="none" stroke="currentColor" strokeWidth="2" />
                    </svg>
                  )}
                </span>
                <span className="truncate">{getSegmentLabel(segment)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SlotCard                                                          */
/* ------------------------------------------------------------------ */

function SlotCard({ slot, index, allSegments, onChange, onRemove, canRemove }) {
  return (
    <div
      className="flex items-start gap-3 rounded-xl border p-3"
      style={{
        borderColor: "var(--border)",
        backgroundColor: "var(--bg-secondary)",
      }}
    >
      <div className="relative shrink-0">
        <select
          value={slot.mode}
          onChange={(e) => onChange({ ...slot, mode: e.target.value })}
          className="appearance-none rounded-lg border py-1.5 pl-3 pr-8 text-sm font-medium"
          style={{
            borderColor: "var(--border)",
            backgroundColor: "var(--bg-primary)",
            color: "var(--text-primary)",
          }}
        >
          {MODE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
          style={{ color: "var(--text-muted)" }}
        />
      </div>

      <SegmentMultiSelect
        allSegments={allSegments}
        selectedIds={slot.segmentIds}
        onChange={(ids) => onChange({ ...slot, segmentIds: ids })}
      />

      <button
        type="button"
        disabled={!canRemove}
        onClick={onRemove}
        className="shrink-0 rounded-lg p-2 transition-opacity hover:opacity-70 disabled:opacity-30"
        style={{ color: "var(--text-muted)" }}
        title="Remove slot"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ConnectorDropdown                                                 */
/* ------------------------------------------------------------------ */

function ConnectorDropdown({ value, onChange }) {
  return (
    <div className="flex justify-center py-1">
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="appearance-none rounded-lg border px-4 py-1 text-xs font-semibold uppercase tracking-wide"
          style={{
            borderColor: "var(--border)",
            backgroundColor: "var(--bg-tertiary)",
            color: "var(--accent)",
          }}
        >
          {CONNECTOR_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2"
          style={{ color: "var(--accent)" }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  UserSidePanel                                                     */
/* ------------------------------------------------------------------ */

function UserSidePanel({ email, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState(null);
  const [segments, setSegments] = useState([]);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (!email) return;
    let mounted = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await getUser(email);
        if (!mounted) return;
        setUser(response.user || null);
        setSegments(response.segments || []);
        setHistory(response.history || []);
      } catch (err) {
        if (mounted) setError(err.message || "Failed to load user details");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [email]);

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
          {loading ? "Loading..." : user?.email || email}
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

        {!loading && user && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full"
                style={{ backgroundColor: "var(--bg-tertiary)" }}
              >
                <User className="h-6 w-6" style={{ color: "var(--accent)" }} />
              </div>
              <div>
                <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                  {user.email}
                </h3>
                {(user.first_name || user.last_name) ? (
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    {[user.first_name, user.last_name].filter(Boolean).join(" ")}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <MetricCard label="Sent" value={fmtInt(user.total_sent)} icon={Send} />
              <MetricCard label="Delivered" value={fmtInt(user.total_delivered)} icon={Send} />
              <MetricCard label="Opened" value={fmtInt(user.total_opened)} icon={MailOpen} />
              <MetricCard label="Clicked" value={fmtInt(user.total_clicked)} icon={MousePointerClick} />
              <MetricCard label="Open Rate" value={fmtPercent(user.open_rate)} icon={MailOpen} />
              <MetricCard label="Click Rate" value={fmtPercent(user.click_rate)} icon={MousePointerClick} />
            </div>

            <div>
              <h3 className="section-title">Segments</h3>
              <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                All segments this user is currently part of
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {segments.map((segment) => (
                  <Link
                    key={segment.id}
                    to={`/segments/${segment.id}`}
                    className="rounded-full border px-3 py-1 text-xs hover:opacity-80"
                    style={{
                      borderColor: "var(--border)",
                      backgroundColor: "var(--bg-tertiary)",
                      color: "var(--text-primary)",
                    }}
                    onClick={onClose}
                  >
                    {segment.display_name || segment.name}
                  </Link>
                ))}
                {segments.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    No segments found for this user.
                  </p>
                ) : null}
              </div>
            </div>

            <div>
              <h3 className="section-title">Broadcasts Sent</h3>
              <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                Broadcast history for this user
              </p>

              <div className="table-container mt-4">
                <table className="min-w-full">
                  <thead className="table-header">
                    <tr>
                      <th>Broadcast</th>
                      <th>Delivered</th>
                      <th>Opened</th>
                      <th>Clicked</th>
                      <th>Last Event</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => (
                      <tr key={`${row.broadcast_id}:${row.email_id}`} className="table-row">
                        <td className="table-cell">
                          <Link
                            to={`/broadcasts/${row.broadcast_id}`}
                            className="link"
                            onClick={onClose}
                          >
                            {row.broadcast_name || row.broadcast_subject || row.broadcast_id}
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
                        <td className="table-cell">{fmtDate(row.last_event_at || row.sent_at)}</td>
                      </tr>
                    ))}
                    {history.length === 0 ? (
                      <tr>
                        <td
                          className="table-cell py-8 text-center"
                          style={{ color: "var(--text-muted)" }}
                          colSpan={5}
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
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  UsersPage                                                         */
/* ------------------------------------------------------------------ */

export default function UsersPage({ refreshToken = 0 }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [headlineTotal, setHeadlineTotal] = useState(0);
  const [parentFolders, setParentFolders] = useState([]);
  const [allSegments, setAllSegments] = useState([]);
  const [page, setPage] = useState(0);
  const [sortField, setSortField] = useState("total_delivered");
  const [sortOrder, setSortOrder] = useState("desc");
  const savedFilter = useMemo(() => loadFilterState(), []);
  const [selectedRootFolderIds, setSelectedRootFolderIds] = useState(
    () => savedFilter?.rootFolderIds || [],
  );
  const [selectedUserEmail, setSelectedUserEmail] = useState("");

  const [slots, setSlots] = useState(
    () => savedFilter?.slots?.length ? savedFilter.slots : [makeEmptySlot()],
  );
  const [appliedSlots, setAppliedSlots] = useState(
    () => savedFilter?.appliedSlots || null,
  );
  const [slotError, setSlotError] = useState("");

  useEffect(() => {
    saveFilterState(slots, appliedSlots, selectedRootFolderIds);
  }, [slots, appliedSlots, selectedRootFolderIds]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      getSegmentFolders(),
      loadAllSegments(),
    ])
      .then(([folderResponse, segmentResponse]) => {
        if (cancelled) return;
        setAllSegments(segmentResponse || []);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  async function load(
    currentQuery = "",
    currentPage = 0,
    sort = sortField,
    order = sortOrder,
    rootFolderIds = selectedRootFolderIds,
    slotsPayload = appliedSlots,
  ) {
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

      if (slotsPayload) {
        params.slots = JSON.stringify(
          slotsPayload.map((slot, index) => {
            const entry = { mode: slot.mode, segment_ids: slot.segmentIds };
            if (index > 0) entry.connector = slot.connector;
            return entry;
          }),
        );
      }

      if (rootFolderIds.length > 0) {
        params.root_folder_ids = rootFolderIds.join(",");
      } else if (!slotsPayload) {
        params.parent_only = true;
      }

      const response = await getUsers(params);
      setUsers(response.data || []);
      setTotal(Number(response.total || 0));
      setHeadlineTotal(Number(response.headline_total || 0));
      setParentFolders(response.parent_folders || []);
    } catch (err) {
      setError(err.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(query.trim(), page, sortField, sortOrder, selectedRootFolderIds, appliedSlots);
  }, [refreshToken, page, sortField, sortOrder, selectedRootFolderIds, appliedSlots]);

  function handleSearch(event) {
    event.preventDefault();
    setPage(0);
    load(query.trim(), 0, sortField, sortOrder, selectedRootFolderIds, appliedSlots);
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

  function toggleRootFolder(folderId) {
    setSelectedRootFolderIds((prev) => (
      prev.includes(folderId)
        ? prev.filter((id) => id !== folderId)
        : [...prev, folderId]
    ));
    setPage(0);
  }

  function clearRootFolders() {
    setSelectedRootFolderIds([]);
    setPage(0);
  }

  /* ---- Slot management ---- */

  function updateSlot(index, updated) {
    setSlots((prev) => prev.map((s, i) => (i === index ? updated : s)));
    setSlotError("");
  }

  function removeSlot(index) {
    setSlots((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) return [makeEmptySlot()];
      return next;
    });
    setSlotError("");
  }

  function addSlot() {
    setSlots((prev) => [...prev, makeEmptySlot()]);
    setSlotError("");
  }

  function updateConnector(index, connector) {
    setSlots((prev) =>
      prev.map((s, i) => (i === index ? { ...s, connector } : s)),
    );
  }

  function applySlots() {
    for (let i = 0; i < slots.length; i++) {
      if (slots[i].segmentIds.length === 0) {
        setSlotError(`Slot ${i + 1} has no segments selected.`);
        return;
      }
    }
    setSlotError("");
    setAppliedSlots(slots);
    setPage(0);
  }

  function clearSlots() {
    setSlots([makeEmptySlot()]);
    setSlotError("");
    setAppliedSlots(null);
    setPage(0);
  }

  const slotsActive = appliedSlots !== null;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, total);
  const allSelected = selectedRootFolderIds.length === 0;

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        {/* Headline + Search */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
            <p
              className="text-6xl font-semibold leading-none tracking-tight"
              style={{ color: "var(--text-primary)" }}
            >
              {fmtInt(headlineTotal)}
            </p>
            <div className="sm:pb-1">
              <h1 className="page-title">Total Users</h1>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Across all parent folders
              </p>
            </div>
          </div>

          <form className="flex gap-2 lg:justify-end" onSubmit={handleSearch}>
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

        {/* Slot Builder */}
        <div className="space-y-3">
          <div>
            <h2 className="section-title">Segment Filter</h2>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Build a filter by combining segments. Each slot selects segments
              with ANY (union) or ALL (intersection). Connect slots with Union,
              Intersect, or Exclude.
            </p>
          </div>

          <div className="space-y-1">
            {slots.map((slot, index) => (
              <div key={index}>
                {index > 0 && (
                  <ConnectorDropdown
                    value={slot.connector}
                    onChange={(connector) => updateConnector(index, connector)}
                  />
                )}
                <SlotCard
                  slot={slot}
                  index={index}
                  allSegments={allSegments}
                  onChange={(updated) => updateSlot(index, updated)}
                  onRemove={() => removeSlot(index)}
                  canRemove={slots.length > 1}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="btn-secondary inline-flex items-center gap-1.5 text-sm"
              onClick={addSlot}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Slot
            </button>

            <div className="ml-auto flex gap-2">
              <button
                type="button"
                className="btn-primary text-sm"
                onClick={applySlots}
              >
                Apply
              </button>
              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={clearSlots}
                disabled={!slotsActive && slots.length === 1 && slots[0].segmentIds.length === 0}
              >
                Clear
              </button>
            </div>
          </div>

          {slotError && (
            <p className="text-sm text-red-600 dark:text-red-400">{slotError}</p>
          )}

          {slotsActive && (
            <p className="text-xs font-medium" style={{ color: "var(--accent)" }}>
              Segment filter active ({appliedSlots.length} slot{appliedSlots.length !== 1 ? "s" : ""})
            </p>
          )}
        </div>

        {/* Folder chips */}
        <div className="space-y-3">
          <div>
            <h2 className="section-title">Filter by Tags</h2>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Select one or more parent folders to scope the results.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={clearRootFolders}
              className="rounded-full border px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90"
              style={{
                borderColor: allSelected ? "var(--accent)" : "var(--border)",
                backgroundColor: allSelected ? "var(--accent)" : "var(--bg-primary)",
                color: allSelected ? "white" : "var(--text-primary)",
              }}
            >
              All
            </button>
            {parentFolders.map((folder) => {
              const isSelected = selectedRootFolderIds.includes(folder.id);
              return (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => toggleRootFolder(folder.id)}
                  className="rounded-full border px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90"
                  style={{
                    borderColor: isSelected ? "var(--accent)" : "var(--border)",
                    backgroundColor: isSelected ? "var(--accent)" : "var(--bg-primary)",
                    color: isSelected ? "white" : "var(--text-primary)",
                  }}
                >
                  {folder.name}
                </button>
              );
            })}
          </div>

          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            Users in filter - {fmtInt(total)}
          </p>
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
                    <th>Original Source</th>
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
                    <th>Buyer</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr
                      key={user.email}
                      className="table-row cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedUserEmail(user.email)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedUserEmail(user.email);
                        }
                      }}
                      style={
                        selectedUserEmail === user.email
                          ? { backgroundColor: "var(--bg-tertiary)" }
                          : undefined
                      }
                    >
                      <td className="table-cell">
                        <span className="font-medium" style={{ color: "var(--accent)" }}>
                          {user.email}
                        </span>
                      </td>
                      <td className="table-cell">{user.original_source || "Uncategorized"}</td>
                      <td className="table-cell font-medium" style={{ color: "var(--text-primary)" }}>
                        {fmtInt(user.total_delivered)}
                      </td>
                      <td className="table-cell">{fmtPercent(user.open_rate)}</td>
                      <td className="table-cell">{fmtPercent(user.click_rate)}</td>
                      <td className="table-cell">{user.buyer ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                  {users.length === 0 ? (
                    <tr>
                      <td
                        className="table-cell py-12 text-center"
                        style={{ color: "var(--text-muted)" }}
                        colSpan={6}
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

      {selectedUserEmail && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setSelectedUserEmail("")}
          />
          <UserSidePanel
            email={selectedUserEmail}
            onClose={() => setSelectedUserEmail("")}
          />
        </>
      )}
    </div>
  );
}
