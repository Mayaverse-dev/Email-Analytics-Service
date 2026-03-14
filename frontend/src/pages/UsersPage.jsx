import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
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
} from "lucide-react";
import { getSegmentFolders, getSegments, getUser, getUsers } from "../api/client";
import { fmtDate, fmtInt, fmtPercent } from "../utils/format";
import MetricCard from "../components/MetricCard";

const PAGE_SIZE = 50;
const SEGMENT_PAGE_SIZE = 1000;
const FORMULA_SUGGESTION_LIMIT = 8;

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

function collectFolderIds(folder, ids) {
  ids.add(folder.id);
  for (const child of folder.children || []) {
    collectFolderIds(child, ids);
  }
}

function getEntityLabel(entity) {
  return entity.display_name || entity.name || "";
}

function normalizeFormulaLabel(value) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function escapeFormulaLabel(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function formatFormulaLabel(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed !== value || /[+\-"\\]/.test(trimmed)) {
    return `"${escapeFormulaLabel(trimmed)}"`;
  }
  return trimmed;
}

function flattenFolders(folders, parentPath = []) {
  return folders.flatMap((folder) => {
    const path = [...parentPath, folder.name];
    return [
      {
        id: folder.id,
        name: folder.name,
        path,
      },
      ...flattenFolders(folder.children || [], path),
    ];
  });
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

function parseFormulaExpression(expression) {
  const source = expression.trim();
  if (!source) {
    return { terms: [] };
  }

  const terms = [];
  let operator = "+";
  let buffer = "";
  let inQuotes = false;
  let escaping = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (inQuotes) {
      if (escaping) {
        buffer += char;
        escaping = false;
        continue;
      }
      if (char === "\\") {
        escaping = true;
        continue;
      }
      if (char === "\"") {
        inQuotes = false;
        continue;
      }
      buffer += char;
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      continue;
    }

    if (char === "+" || char === "-") {
      if (!buffer.trim()) {
        if (terms.length === 0 && buffer.length === 0) {
          operator = char;
          continue;
        }
        return { error: "Each + or - needs a segment or folder on both sides." };
      }
      terms.push({ operator, value: buffer.trim() });
      operator = char;
      buffer = "";
      continue;
    }

    buffer += char;
  }

  if (inQuotes || escaping) {
    return { error: "Closing quote is missing." };
  }

  if (!buffer.trim()) {
    return { error: "Formula cannot end with + or -." };
  }

  terms.push({ operator, value: buffer.trim() });
  return { terms };
}

function getFormulaOperatorIndices(expression) {
  const indices = [];
  let inQuotes = false;
  let escaping = false;

  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index];

    if (inQuotes) {
      if (escaping) {
        escaping = false;
        continue;
      }
      if (char === "\\") {
        escaping = true;
        continue;
      }
      if (char === "\"") {
        inQuotes = false;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      continue;
    }

    if (char === "+" || char === "-") {
      indices.push(index);
    }
  }

  return indices;
}

function getFormulaTokenRange(expression, cursorIndex) {
  const indices = getFormulaOperatorIndices(expression);
  const previousOperator = [...indices].reverse().find((index) => index < cursorIndex);
  const nextOperator = indices.find((index) => index >= cursorIndex);

  return {
    start: previousOperator === undefined ? 0 : previousOperator + 1,
    end: nextOperator === undefined ? expression.length : nextOperator,
  };
}

function getFormulaSearchText(value) {
  return normalizeFormulaLabel(value.trim().replace(/^"/, "").replace(/\\(.)/g, "$1"));
}

function getSuggestionScore(item, query) {
  let score = 3;

  for (const key of item.searchKeys) {
    if (key === query) {
      score = Math.min(score, 0);
    } else if (key.startsWith(query)) {
      score = Math.min(score, 1);
    } else if (key.includes(query)) {
      score = Math.min(score, 2);
    }
  }

  return score;
}

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

export default function UsersPage({ refreshToken = 0 }) {
  const formulaInputRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [headlineTotal, setHeadlineTotal] = useState(0);
  const [parentFolders, setParentFolders] = useState([]);
  const [folderTree, setFolderTree] = useState([]);
  const [allSegments, setAllSegments] = useState([]);
  const [page, setPage] = useState(0);
  const [sortField, setSortField] = useState("total_delivered");
  const [sortOrder, setSortOrder] = useState("desc");
  const [selectedRootFolderIds, setSelectedRootFolderIds] = useState([]);
  const [selectedUserEmail, setSelectedUserEmail] = useState("");
  const [formulaDraft, setFormulaDraft] = useState("");
  const [appliedFormulaText, setAppliedFormulaText] = useState("");
  const [appliedFormulaFilters, setAppliedFormulaFilters] = useState(null);
  const [formulaError, setFormulaError] = useState("");
  const [formulaCursorIndex, setFormulaCursorIndex] = useState(0);
  const [formulaFocused, setFormulaFocused] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState("");

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      getSegmentFolders(),
      loadAllSegments(),
    ])
      .then(([folderResponse, segmentResponse]) => {
        if (cancelled) return;
        setFolderTree(folderResponse.folders || []);
        setAllSegments(segmentResponse || []);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  useEffect(() => {
    if (!copyFeedback) return undefined;
    const timeout = window.setTimeout(() => setCopyFeedback(""), 1800);
    return () => window.clearTimeout(timeout);
  }, [copyFeedback]);

  async function load(
    currentQuery = "",
    currentPage = 0,
    sort = sortField,
    order = sortOrder,
    rootFolderIds = selectedRootFolderIds,
    formulaFilters = appliedFormulaFilters,
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

      if (formulaFilters) {
        if (formulaFilters.includeSegmentIds.length > 0) {
          params.include_segments = formulaFilters.includeSegmentIds.join(",");
        }
        if (formulaFilters.excludeSegmentIds.length > 0) {
          params.exclude_segments = formulaFilters.excludeSegmentIds.join(",");
        }
        if (formulaFilters.includeFolderIds.length > 0) {
          params.include_folders = formulaFilters.includeFolderIds.join(",");
        }
        if (formulaFilters.excludeFolderIds.length > 0) {
          params.exclude_folders = formulaFilters.excludeFolderIds.join(",");
        }
      } else {
        params.parent_only = true;
        if (rootFolderIds.length > 0) {
          params.root_folder_ids = rootFolderIds.join(",");
        }
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
    load(query.trim(), page, sortField, sortOrder, selectedRootFolderIds, appliedFormulaFilters);
  }, [refreshToken, page, sortField, sortOrder, selectedRootFolderIds, appliedFormulaFilters]);

  function handleSearch(event) {
    event.preventDefault();
    setPage(0);
    load(query.trim(), 0, sortField, sortOrder, selectedRootFolderIds, appliedFormulaFilters);
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

  const formulaActive = appliedFormulaFilters !== null;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, total);
  const allSelected = selectedRootFolderIds.length === 0;
  const flattenedFolders = useMemo(() => flattenFolders(folderTree), [folderTree]);
  const folderNameById = useMemo(() => (
    new Map(flattenedFolders.map((folder) => [folder.id, folder.name]))
  ), [flattenedFolders]);
  const formulaItems = useMemo(() => {
    const folders = flattenedFolders.map((folder) => ({
      key: `folder:${folder.id}`,
      type: "folder",
      id: folder.id,
      label: folder.name,
      detail: folder.path.length > 1 ? folder.path.slice(0, -1).join(" / ") : "Folder",
      searchKeys: Array.from(new Set([
        normalizeFormulaLabel(folder.name),
        normalizeFormulaLabel(folder.path.join(" / ")),
      ].filter(Boolean))),
    }));

    const segments = allSegments
      .map((segment) => {
        const label = getEntityLabel(segment);
        return {
          key: `segment:${segment.id}`,
          type: "segment",
          id: segment.id,
          label,
          detail: folderNameById.get(segment.folder_id) || "Unfoldered",
          searchKeys: Array.from(new Set([
            normalizeFormulaLabel(label),
            normalizeFormulaLabel(segment.display_name || ""),
            normalizeFormulaLabel(segment.name || ""),
          ].filter(Boolean))),
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));

    return [...folders, ...segments];
  }, [allSegments, flattenedFolders, folderNameById]);
  const formulaLookups = useMemo(() => {
    const segmentMap = new Map();
    const folderMap = new Map();

    for (const item of formulaItems) {
      const targetMap = item.type === "segment" ? segmentMap : folderMap;
      for (const key of item.searchKeys) {
        if (!targetMap.has(key)) {
          targetMap.set(key, []);
        }
        targetMap.get(key).push(item);
      }
    }

    return { segmentMap, folderMap };
  }, [formulaItems]);
  const formulaTokenRange = useMemo(() => (
    getFormulaTokenRange(formulaDraft, formulaCursorIndex)
  ), [formulaCursorIndex, formulaDraft]);
  const formulaSuggestions = useMemo(() => {
    if (!formulaFocused) {
      return [];
    }

    const token = formulaDraft.slice(formulaTokenRange.start, formulaTokenRange.end);
    const queryText = getFormulaSearchText(token);
    if (!queryText) {
      return [];
    }

    return formulaItems
      .filter((item) => item.searchKeys.some((key) => key.includes(queryText)))
      .sort((a, b) => {
        const scoreDelta = getSuggestionScore(a, queryText) - getSuggestionScore(b, queryText);
        if (scoreDelta !== 0) {
          return scoreDelta;
        }
        if (a.type !== b.type) {
          return a.type.localeCompare(b.type);
        }
        return a.label.localeCompare(b.label);
      })
      .slice(0, FORMULA_SUGGESTION_LIMIT);
  }, [formulaDraft, formulaFocused, formulaItems, formulaTokenRange]);
  const selectedFolderSegments = useMemo(() => {
    if (selectedRootFolderIds.length === 0 || folderTree.length === 0 || allSegments.length === 0) {
      return [];
    }

    return parentFolders
      .filter((folder) => selectedRootFolderIds.includes(folder.id))
      .map((folder) => {
        const rootFolder = folderTree.find((item) => item.id === folder.id);
        const descendantFolderIds = new Set();
        if (rootFolder) {
          collectFolderIds(rootFolder, descendantFolderIds);
        }

        const segments = allSegments
          .filter((segment) => segment.folder_id !== null && descendantFolderIds.has(segment.folder_id))
          .sort((a, b) => {
            const aName = a.display_name || a.name || "";
            const bName = b.display_name || b.name || "";
            return aName.localeCompare(bName);
          });

        return {
          id: folder.id,
          name: folder.name,
          segments,
        };
      });
  }, [allSegments, folderTree, parentFolders, selectedRootFolderIds]);

  function resolveFormula(expression) {
    const parsed = parseFormulaExpression(expression);
    if (parsed.error) {
      return { error: parsed.error };
    }
    if (parsed.terms.length === 0) {
      return { error: "Enter at least one segment or folder." };
    }

    const includeSegmentIds = new Set();
    const excludeSegmentIds = new Set();
    const includeFolderIds = new Set();
    const excludeFolderIds = new Set();

    for (const term of parsed.terms) {
      const normalizedTerm = normalizeFormulaLabel(term.value);
      const matchingSegments = formulaLookups.segmentMap.get(normalizedTerm) || [];
      const matchingFolders = formulaLookups.folderMap.get(normalizedTerm) || [];
      const matches = [...matchingSegments, ...matchingFolders];

      if (matches.length === 0) {
        return { error: `Couldn't find "${term.value}".` };
      }

      if (matches.length > 1) {
        return {
          error: `"${term.value}" matches multiple segments or folders. Pick it from suggestions or copy it from the list.`,
        };
      }

      const [match] = matches;
      if (term.operator === "-") {
        if (match.type === "segment") {
          excludeSegmentIds.add(match.id);
        } else {
          excludeFolderIds.add(match.id);
        }
      } else if (match.type === "segment") {
        includeSegmentIds.add(match.id);
      } else {
        includeFolderIds.add(match.id);
      }
    }

    if (includeSegmentIds.size === 0 && includeFolderIds.size === 0) {
      return { error: "Add at least one segment or folder before subtracting." };
    }

    return {
      filters: {
        includeSegmentIds: Array.from(includeSegmentIds).sort(),
        excludeSegmentIds: Array.from(excludeSegmentIds).sort(),
        includeFolderIds: Array.from(includeFolderIds).sort((a, b) => a - b),
        excludeFolderIds: Array.from(excludeFolderIds).sort((a, b) => a - b),
      },
    };
  }

  function syncFormulaCursor(target) {
    setFormulaCursorIndex(target.selectionStart ?? target.value.length);
  }

  function handleFormulaChange(event) {
    setFormulaDraft(event.target.value);
    syncFormulaCursor(event.target);
    setFormulaError("");
  }

  function applyFormula(event) {
    event.preventDefault();
    const trimmed = formulaDraft.trim();

    if (!trimmed) {
      setFormulaError("Enter a segment or folder formula.");
      return;
    }

    const resolved = resolveFormula(trimmed);
    if (resolved.error) {
      setFormulaError(resolved.error);
      return;
    }

    setFormulaError("");
    setAppliedFormulaText(trimmed);
    setAppliedFormulaFilters(resolved.filters);
    setSelectedRootFolderIds([]);
    setPage(0);
  }

  function clearFormula() {
    setFormulaDraft("");
    setAppliedFormulaText("");
    setAppliedFormulaFilters(null);
    setFormulaError("");
    setFormulaCursorIndex(0);
    setPage(0);
  }

  function insertSuggestion(item) {
    const range = getFormulaTokenRange(formulaDraft, formulaCursorIndex);
    const currentSlice = formulaDraft.slice(range.start, range.end);
    const leadingWhitespace = currentSlice.match(/^\s*/)?.[0] || "";
    const trailingWhitespace = currentSlice.match(/\s*$/)?.[0] || "";
    const formattedLabel = formatFormulaLabel(item.label);
    const replacement = `${leadingWhitespace}${formattedLabel}${trailingWhitespace}`;
    const nextValue = (
      formulaDraft.slice(0, range.start)
      + replacement
      + formulaDraft.slice(range.end)
    );
    const nextCursorIndex = range.start + replacement.length;

    setFormulaDraft(nextValue);
    setFormulaCursorIndex(nextCursorIndex);
    setFormulaError("");

    window.requestAnimationFrame(() => {
      if (!formulaInputRef.current) return;
      formulaInputRef.current.focus();
      formulaInputRef.current.setSelectionRange(nextCursorIndex, nextCursorIndex);
    });
  }

  async function copySegmentLabel(segment) {
    const formattedLabel = formatFormulaLabel(getEntityLabel(segment));

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(formattedLabel);
      setCopyFeedback(`Copied ${formattedLabel}`);
    } catch {
      setCopyFeedback("Could not copy that segment.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-6">
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

        <div className="space-y-4">
          <div className="space-y-3">
            <div>
              <h2 className="section-title">Formula Filter</h2>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Combine segments and folders with <code>+</code> and <code>-</code>. Example:
                {" "}
                <code>Trials of Maya + Inner Circle - &quot;Dropped Backers Latest&quot;</code>
              </p>
            </div>

            <form className="flex flex-col gap-3 lg:flex-row lg:items-start" onSubmit={applyFormula}>
              <div className="relative flex-1">
                <input
                  ref={formulaInputRef}
                  value={formulaDraft}
                  onChange={handleFormulaChange}
                  onClick={(event) => syncFormulaCursor(event.target)}
                  onKeyUp={(event) => syncFormulaCursor(event.target)}
                  onSelect={(event) => syncFormulaCursor(event.target)}
                  onFocus={(event) => {
                    setFormulaFocused(true);
                    syncFormulaCursor(event.target);
                  }}
                  onBlur={() => setFormulaFocused(false)}
                  placeholder='Try: folder1 + segment2 - "Dropped Backers Latest"'
                  className="input"
                  spellCheck={false}
                />

                {formulaSuggestions.length > 0 ? (
                  <div
                    className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-xl border shadow-lg"
                    style={{
                      borderColor: "var(--border-color)",
                      backgroundColor: "var(--bg-secondary)",
                    }}
                  >
                    {formulaSuggestions.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className="flex w-full items-center justify-between px-4 py-2 text-left text-sm transition-colors hover:opacity-90"
                        style={{ color: "var(--text-primary)" }}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          insertSuggestion(item);
                        }}
                      >
                        <span>{item.label}</span>
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {item.type === "segment" ? `Segment in ${item.detail}` : `Folder: ${item.detail}`}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="flex gap-2">
                <button type="submit" className="btn-primary">
                  Apply Formula
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={clearFormula}
                  disabled={!formulaDraft && !formulaActive}
                >
                  Clear
                </button>
              </div>
            </form>

            {formulaError ? (
              <p className="text-sm text-red-600 dark:text-red-400">{formulaError}</p>
            ) : null}

            {formulaActive ? (
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Active formula: <code>{appliedFormulaText}</code>
              </p>
            ) : (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Formula filters replace the folder chips while active.
              </p>
            )}

            {copyFeedback ? (
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {copyFeedback}
              </p>
            ) : null}
          </div>

          <div>
            <h2 className="section-title">Filter by Tags</h2>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {formulaActive
                ? "Clear the active formula to use the parent-folder chips again."
                : "Select one or more parent folders to filter the users table."}
            </p>
          </div>

          <div className={`flex flex-wrap gap-2 ${formulaActive ? "pointer-events-none opacity-60" : ""}`}>
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

          {!formulaActive && selectedFolderSegments.length > 0 ? (
            <div className="space-y-3">
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Click any segment to copy it into your formula.
              </p>
              {selectedFolderSegments.map((folder) => (
                <div key={folder.id} className="space-y-2">
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {folder.name}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {folder.segments.map((segment) => (
                      <button
                        key={segment.id}
                        type="button"
                        onClick={() => copySegmentLabel(segment)}
                        className="rounded-full border px-3 py-1 text-xs transition-opacity hover:opacity-90"
                        style={{
                          borderColor: "var(--border-color)",
                          backgroundColor: "var(--bg-tertiary)",
                          color: "var(--text-primary)",
                        }}
                      >
                        {getEntityLabel(segment)}
                      </button>
                    ))}
                    {folder.segments.length === 0 ? (
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        No segments in this folder.
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
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
