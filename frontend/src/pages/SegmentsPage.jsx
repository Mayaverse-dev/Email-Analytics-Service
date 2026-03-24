import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { Layers, Loader2, FolderOpen, FolderClosed, ChevronRight, ChevronDown, ArrowRightLeft, Pencil, Check, X, Upload, Search, AlertCircle, CheckCircle2 } from "lucide-react";
import { getSegments, getSegmentFolders, moveSegmentToFolder, renameSegment, importCsvToSegment } from "../api/client";
import { fmtInt, fmtPercent } from "../utils/format";

const EXPANDED_FOLDERS_STORAGE_KEY = "segmentsPage.expandedFolders";

function collectFolderIds(list) {
  const ids = new Set();

  function collect(items) {
    for (const folder of items) {
      ids.add(folder.id);
      if (folder.children) collect(folder.children);
    }
  }

  collect(list);
  return ids;
}

function readExpandedFolderState() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(EXPANDED_FOLDERS_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.expanded) || !Array.isArray(parsed.known)) return null;

    return {
      expanded: new Set(parsed.expanded),
      known: new Set(parsed.known),
    };
  } catch {
    return null;
  }
}

function writeExpandedFolderState(expandedFolders, allFolderIds) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      EXPANDED_FOLDERS_STORAGE_KEY,
      JSON.stringify({
        expanded: [...expandedFolders],
        known: [...allFolderIds],
      })
    );
  } catch {
    // Ignore storage failures so the page still works normally.
  }
}

function FolderRow({ folder, segments, depth, expandedFolders, toggleFolder, onMove, onRename, allFolders }) {
  const isExpanded = expandedFolders.has(folder.id);
  const folderSegments = segments.filter((s) => s.folder_id === folder.id);
  const totalContacts = folder.total_contacts || 0;

  return (
    <>
      <tr
        className="table-row cursor-pointer"
        onClick={() => toggleFolder(folder.id)}
        style={{ backgroundColor: depth === 0 ? "var(--bg-secondary)" : undefined }}
      >
        <td className="table-cell" colSpan={8}>
          <div className="flex items-center gap-2" style={{ paddingLeft: `${depth * 20}px` }}>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
            ) : (
              <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
            )}
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 flex-shrink-0" style={{ color: "var(--accent)" }} />
            ) : (
              <FolderClosed className="h-4 w-4 flex-shrink-0" style={{ color: "var(--accent)" }} />
            )}
            <span className="font-medium" style={{ color: "var(--text-primary)" }}>
              {folder.name}
            </span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {fmtInt(totalContacts)} contacts
            </span>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <>
          {folder.children?.map((child) => (
            <FolderRow
              key={`folder-${child.id}`}
              folder={child}
              segments={segments}
              depth={depth + 1}
              expandedFolders={expandedFolders}
              toggleFolder={toggleFolder}
              onMove={onMove}
              onRename={onRename}
              allFolders={allFolders}
            />
          ))}
          {folderSegments.map((seg) => (
            <SegmentRow
              key={seg.id}
              segment={seg}
              depth={depth + 1}
              onMove={onMove}
              onRename={onRename}
              allFolders={allFolders}
            />
          ))}
          {folder.children?.length === 0 && folderSegments.length === 0 && (
            <tr>
              <td
                className="table-cell py-3 text-xs italic"
                style={{ color: "var(--text-muted)", paddingLeft: `${(depth + 1) * 20 + 24}px` }}
                colSpan={8}
              >
                Empty folder
              </td>
            </tr>
          )}
        </>
      )}
    </>
  );
}

function SegmentRow({ segment, depth, onMove, onRename, allFolders }) {
  const [showMove, setShowMove] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(segment.display_name || segment.name || "");

  const displayName = segment.display_name || segment.name || segment.id;

  const handleRename = async () => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === displayName) {
      setEditing(false);
      return;
    }
    await onRename(segment.id, trimmed);
    setEditing(false);
  };

  return (
    <tr key={segment.id} className="table-row">
      <td className="table-cell">
        <div className="flex items-center gap-2" style={{ paddingLeft: `${depth * 20 + 8}px` }}>
          {editing ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                  if (e.key === "Escape") setEditing(false);
                }}
                autoFocus
                className="rounded border px-2 py-0.5 text-sm"
                style={{
                  borderColor: "var(--border)",
                  backgroundColor: "var(--bg-primary)",
                  color: "var(--text-primary)",
                }}
              />
              <button onClick={handleRename} className="rounded p-0.5" style={{ color: "var(--accent)" }}>
                <Check className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setEditing(false)} className="rounded p-0.5" style={{ color: "var(--text-muted)" }}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <>
              <Link to={`/segments/${segment.id}`} className="link font-medium">
                {displayName}
              </Link>
              <button
                onClick={(e) => { e.stopPropagation(); setEditValue(displayName); setEditing(true); }}
                className="ml-1 rounded p-1 opacity-0 transition-opacity hover:opacity-100"
                style={{ color: "var(--text-muted)" }}
                title="Rename segment"
                onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                onMouseLeave={(e) => e.currentTarget.style.opacity = 0}
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setShowMove(!showMove); }}
                className="rounded p-1 opacity-0 transition-opacity hover:opacity-100"
                style={{ color: "var(--text-muted)" }}
                title="Move to folder"
                onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                onMouseLeave={(e) => { if (!showMove) e.currentTarget.style.opacity = 0; }}
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {showMove && (
            <FolderPicker
              folders={allFolders}
              currentFolderId={segment.folder_id}
              onSelect={(folderId) => {
                onMove(segment.id, folderId);
                setShowMove(false);
              }}
              onClose={() => setShowMove(false)}
            />
          )}
        </div>
      </td>
      <td className="table-cell font-medium" style={{ color: "var(--text-primary)" }}>
        {fmtInt(segment.total_contacts)}
      </td>
      <td className="table-cell">{fmtInt(segment.total_broadcasts)}</td>
      <td className="table-cell">{fmtInt(segment.total_delivered)}</td>
      <td className="table-cell">{fmtInt(segment.total_opened)}</td>
      <td className="table-cell">{fmtInt(segment.total_clicked)}</td>
      <td className="table-cell">{fmtPercent(segment.open_rate)}</td>
      <td className="table-cell">{fmtPercent(segment.click_rate)}</td>
    </tr>
  );
}

function FolderPicker({ folders, currentFolderId, onSelect, onClose }) {
  const flatFolders = useMemo(() => {
    const result = [];
    function flatten(list, depth) {
      for (const f of list) {
        result.push({ ...f, depth });
        if (f.children) flatten(f.children, depth + 1);
      }
    }
    flatten(folders, 0);
    return result;
  }, [folders]);

  return (
    <div
      className="absolute z-50 mt-1 rounded-lg border shadow-lg"
      style={{
        backgroundColor: "var(--bg-primary)",
        borderColor: "var(--border)",
        minWidth: "200px",
      }}
    >
      <div className="p-1">
        <button
          onClick={() => onSelect(null)}
          className={`w-full rounded px-3 py-1.5 text-left text-sm hover:opacity-80 ${
            currentFolderId === null ? "font-semibold" : ""
          }`}
          style={{
            color: "var(--text-primary)",
            backgroundColor: currentFolderId === null ? "var(--bg-tertiary)" : undefined,
          }}
        >
          No folder
        </button>
        {flatFolders.map((f) => (
          <button
            key={f.id}
            onClick={() => onSelect(f.id)}
            className={`w-full rounded px-3 py-1.5 text-left text-sm hover:opacity-80 ${
              currentFolderId === f.id ? "font-semibold" : ""
            }`}
            style={{
              color: "var(--text-primary)",
              backgroundColor: currentFolderId === f.id ? "var(--bg-tertiary)" : undefined,
              paddingLeft: `${f.depth * 16 + 12}px`,
            }}
          >
            {f.name}
          </button>
        ))}
      </div>
      <div
        className="border-t p-1"
        style={{ borderColor: "var(--border)" }}
      >
        <button
          onClick={onClose}
          className="w-full rounded px-3 py-1.5 text-left text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

const EMAIL_PATTERNS = ["email", "e-mail", "email_address", "emailaddress", "mail"];
const FIRST_NAME_PATTERNS = ["first_name", "firstname", "first name", "fname", "given_name"];
const LAST_NAME_PATTERNS = ["last_name", "lastname", "last name", "lname", "surname", "family_name"];

function detectDelimiter(text) {
  const firstLine = text.split("\n")[0] || "";
  const commas = (firstLine.match(/,/g) || []).length;
  const tabs = (firstLine.match(/\t/g) || []).length;
  const semicolons = (firstLine.match(/;/g) || []).length;
  if (tabs >= commas && tabs >= semicolons && tabs > 0) return "\t";
  if (semicolons > commas && semicolons > 0) return ";";
  return ",";
}

function parseCsvLine(line, delimiter) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === delimiter) { fields.push(current.trim()); current = ""; }
      else current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCsv(text) {
  const delimiter = detectDelimiter(text);
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0], delimiter);
  const rows = lines.slice(1).map((l) => parseCsvLine(l, delimiter));
  return { headers, rows };
}

function autoMapColumns(headers) {
  const map = { email: -1, first_name: -1, last_name: -1 };
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (let i = 0; i < lower.length; i++) {
    if (EMAIL_PATTERNS.includes(lower[i])) map.email = i;
    else if (FIRST_NAME_PATTERNS.includes(lower[i])) map.first_name = i;
    else if (LAST_NAME_PATTERNS.includes(lower[i])) map.last_name = i;
  }
  if (map.email === -1) map.email = 0;
  return map;
}

function ImportCsvModal({ segments, onClose, onImported }) {
  const fileRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [colMap, setColMap] = useState({ email: -1, first_name: -1, last_name: -1 });
  const [targetMode, setTargetMode] = useState("new");
  const [newName, setNewName] = useState("");
  const [selectedSegmentId, setSelectedSegmentId] = useState("");
  const [segSearch, setSegSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const handleFile = useCallback((file) => {
    if (!file) return;
    setFileName(file.name);
    setError("");
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const { headers: h, rows: r } = parseCsv(e.target.result);
        if (h.length === 0) { setError("File appears empty"); return; }
        setHeaders(h);
        setRows(r);
        setColMap(autoMapColumns(h));
      } catch {
        setError("Failed to parse CSV file");
      }
    };
    reader.readAsText(file);
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const flatSegments = useMemo(() => {
    return [...segments].sort((a, b) =>
      (a.display_name || a.name || "").localeCompare(b.display_name || b.name || "")
    );
  }, [segments]);

  const filteredSegments = useMemo(() => {
    if (!segSearch.trim()) return flatSegments;
    const q = segSearch.toLowerCase();
    return flatSegments.filter((s) =>
      (s.display_name || s.name || "").toLowerCase().includes(q)
    );
  }, [flatSegments, segSearch]);

  const validEmails = useMemo(() => {
    if (colMap.email < 0 || rows.length === 0) return 0;
    return rows.filter((r) => {
      const v = r[colMap.email];
      return v && v.includes("@");
    }).length;
  }, [rows, colMap.email]);

  const canImport =
    rows.length > 0 &&
    colMap.email >= 0 &&
    validEmails > 0 &&
    (targetMode === "new" ? newName.trim() : selectedSegmentId);

  const handleImport = async () => {
    setImporting(true);
    setError("");
    setResult(null);
    try {
      const contacts = rows
        .filter((r) => r[colMap.email] && r[colMap.email].includes("@"))
        .map((r) => ({
          email: r[colMap.email],
          first_name: colMap.first_name >= 0 ? r[colMap.first_name] || null : null,
          last_name: colMap.last_name >= 0 ? r[colMap.last_name] || null : null,
        }));

      const payload = { contacts };
      if (targetMode === "new") payload.new_segment_name = newName.trim();
      else payload.segment_id = selectedSegmentId;

      const res = await importCsvToSegment(payload);
      setResult(res);
      onImported();
    } catch (err) {
      setError(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const previewRows = rows.slice(0, 5);
  const hasFile = headers.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget && !importing) onClose(); }}
    >
      <div
        className="relative w-full max-w-2xl rounded-xl border shadow-2xl"
        style={{
          backgroundColor: "var(--bg-primary)",
          borderColor: "var(--border)",
          maxHeight: "90vh",
          overflow: "auto",
        }}
      >
        <div className="flex items-center justify-between border-b p-5" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Import CSV</h2>
          {!importing && (
            <button onClick={onClose} className="rounded p-1" style={{ color: "var(--text-muted)" }}>
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="space-y-5 p-5">
          {/* File Upload */}
          {!hasFile && (
            <div
              className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 transition-colors ${dragOver ? "border-solid" : ""}`}
              style={{
                borderColor: dragOver ? "var(--accent)" : "var(--border)",
                backgroundColor: dragOver ? "var(--bg-tertiary)" : "var(--bg-secondary)",
              }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="mb-3 h-10 w-10" style={{ color: "var(--text-muted)" }} />
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Drop a CSV file here or click to browse
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                Supports .csv files with email addresses
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>
          )}

          {/* File loaded: preview + mapping */}
          {hasFile && !result && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {fileName} — {rows.length} rows, {validEmails} valid emails
                </p>
                <button
                  onClick={() => { setHeaders([]); setRows([]); setFileName(""); setResult(null); setError(""); }}
                  className="text-xs underline"
                  style={{ color: "var(--accent)" }}
                >
                  Change file
                </button>
              </div>

              {/* Column mapping */}
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Column Mapping
                </p>
                <div className="flex gap-3">
                  {[
                    { key: "email", label: "Email *" },
                    { key: "first_name", label: "First Name" },
                    { key: "last_name", label: "Last Name" },
                  ].map(({ key, label }) => (
                    <div key={key} className="flex-1">
                      <label className="mb-1 block text-xs" style={{ color: "var(--text-secondary)" }}>
                        {label}
                      </label>
                      <select
                        value={colMap[key]}
                        onChange={(e) => setColMap((prev) => ({ ...prev, [key]: parseInt(e.target.value) }))}
                        className="w-full rounded border px-2 py-1.5 text-sm"
                        style={{
                          borderColor: "var(--border)",
                          backgroundColor: "var(--bg-secondary)",
                          color: "var(--text-primary)",
                        }}
                      >
                        <option value={-1}>(skip)</option>
                        {headers.map((h, i) => (
                          <option key={i} value={i}>{h}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview table */}
              {previewRows.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                    Preview (first {previewRows.length} rows)
                  </p>
                  <div className="overflow-x-auto rounded border" style={{ borderColor: "var(--border)" }}>
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr style={{ backgroundColor: "var(--bg-secondary)" }}>
                          {headers.map((h, i) => (
                            <th
                              key={i}
                              className="px-3 py-2 text-left font-medium"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {h}
                              {colMap.email === i && <span className="ml-1 text-green-600">(Email)</span>}
                              {colMap.first_name === i && <span className="ml-1 text-blue-500">(First)</span>}
                              {colMap.last_name === i && <span className="ml-1 text-blue-500">(Last)</span>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, ri) => (
                          <tr key={ri} className="border-t" style={{ borderColor: "var(--border)" }}>
                            {row.map((cell, ci) => (
                              <td key={ci} className="px-3 py-1.5" style={{ color: "var(--text-primary)" }}>
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Target segment */}
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Target Segment
                </p>
                <div className="mb-3 flex gap-4">
                  {[
                    { value: "new", label: "Create new segment" },
                    { value: "existing", label: "Add to existing segment" },
                  ].map(({ value, label }) => (
                    <label key={value} className="flex cursor-pointer items-center gap-2 text-sm" style={{ color: "var(--text-primary)" }}>
                      <input
                        type="radio"
                        name="targetMode"
                        value={value}
                        checked={targetMode === value}
                        onChange={() => setTargetMode(value)}
                        style={{ accentColor: "var(--accent)" }}
                      />
                      {label}
                    </label>
                  ))}
                </div>

                {targetMode === "new" && (
                  <input
                    type="text"
                    placeholder="Segment name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full rounded border px-3 py-2 text-sm"
                    style={{
                      borderColor: "var(--border)",
                      backgroundColor: "var(--bg-secondary)",
                      color: "var(--text-primary)",
                    }}
                  />
                )}

                {targetMode === "existing" && (
                  <div>
                    <div className="relative mb-2">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4" style={{ color: "var(--text-muted)" }} />
                      <input
                        type="text"
                        placeholder="Search segments..."
                        value={segSearch}
                        onChange={(e) => setSegSearch(e.target.value)}
                        className="w-full rounded border py-2 pl-8 pr-3 text-sm"
                        style={{
                          borderColor: "var(--border)",
                          backgroundColor: "var(--bg-secondary)",
                          color: "var(--text-primary)",
                        }}
                      />
                    </div>
                    <div
                      className="max-h-40 overflow-y-auto rounded border"
                      style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-secondary)" }}
                    >
                      {filteredSegments.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => setSelectedSegmentId(s.id)}
                          className="block w-full px-3 py-1.5 text-left text-sm transition-colors"
                          style={{
                            color: "var(--text-primary)",
                            backgroundColor: selectedSegmentId === s.id ? "var(--bg-tertiary)" : undefined,
                          }}
                        >
                          {s.display_name || s.name}
                          <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>
                            {fmtInt(s.total_contacts)} contacts
                          </span>
                        </button>
                      ))}
                      {filteredSegments.length === 0 && (
                        <p className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>No segments found</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Result */}
          {result && (
            <div
              className="flex items-start gap-3 rounded-lg border p-4"
              style={{ borderColor: "var(--accent)", backgroundColor: "var(--bg-tertiary)" }}
            >
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0" style={{ color: "var(--accent)" }} />
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  Import complete
                </p>
                <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                  Added {fmtInt(result.added)} contacts to <strong>{result.segment_name}</strong>
                  {result.skipped > 0 && <> ({fmtInt(result.skipped)} already existed)</>}
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              className="flex items-start gap-3 rounded-lg border border-red-300 p-4 dark:border-red-800"
              style={{ backgroundColor: "var(--bg-tertiary)" }}
            >
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t p-5" style={{ borderColor: "var(--border)" }}>
          {!result && (
            <>
              <button
                onClick={onClose}
                disabled={importing}
                className="rounded-lg border px-4 py-2 text-sm"
                style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!canImport || importing}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: "var(--accent)" }}
              >
                {importing && <Loader2 className="h-4 w-4 animate-spin" />}
                {importing ? "Importing..." : `Import ${fmtInt(validEmails)} contacts`}
              </button>
            </>
          )}
          {result && (
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: "var(--accent)" }}
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SegmentsPage({ refreshToken = 0 }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [segments, setSegments] = useState([]);
  const [folders, setFolders] = useState([]);
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [showImportModal, setShowImportModal] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoading(true);
        const [segRes, folderRes] = await Promise.all([
          getSegments({ limit: 500, offset: 0 }),
          getSegmentFolders(),
        ]);
        if (mounted) {
          const nextSegments = segRes.data || [];
          const nextFolders = folderRes.folders || [];
          const allIds = collectFolderIds(nextFolders);
          const storedState = readExpandedFolderState();

          setSegments(nextSegments);
          setFolders(nextFolders);
          if (!storedState) {
            setExpandedFolders(allIds);
          } else {
            const nextExpandedFolders = new Set();
            for (const folderId of allIds) {
              if (!storedState.known.has(folderId) || storedState.expanded.has(folderId)) {
                nextExpandedFolders.add(folderId);
              }
            }
            setExpandedFolders(nextExpandedFolders);
          }
        }
      } catch (err) {
        if (mounted) setError(err.message || "Failed to load segments");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [refreshToken, reloadKey]);

  useEffect(() => {
    const allFolderIds = collectFolderIds(folders);
    if (allFolderIds.size === 0) return;
    writeExpandedFolderState(expandedFolders, allFolderIds);
  }, [expandedFolders, folders]);

  const toggleFolder = (folderId) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const handleMove = async (segmentId, folderId) => {
    try {
      await moveSegmentToFolder(segmentId, folderId);
      setSegments((prev) =>
        prev.map((s) => (s.id === segmentId ? { ...s, folder_id: folderId } : s))
      );
    } catch (err) {
      alert("Failed to move segment: " + err.message);
    }
  };

  const handleRename = async (segmentId, newName) => {
    try {
      await renameSegment(segmentId, newName);
      setSegments((prev) =>
        prev.map((s) => (s.id === segmentId ? { ...s, display_name: newName } : s))
      );
    } catch (err) {
      alert("Failed to rename segment: " + err.message);
    }
  };

  const unfolderedSegments = segments.filter((s) => s.folder_id === null || s.folder_id === undefined);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ backgroundColor: "var(--bg-tertiary)" }}
          >
            <Layers className="h-6 w-6" style={{ color: "var(--accent)" }} />
          </div>
          <div>
            <h1 className="page-title">Segments</h1>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {segments.length} total segments
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowImportModal(true)}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: "var(--accent)" }}
        >
          <Upload className="h-4 w-4" />
          Import CSV
        </button>
      </div>

      <div className="card p-0">
        <div className="table-container border-0">
          <table className="min-w-full">
            <thead className="table-header">
              <tr>
                <th>Segment</th>
                <th>Contacts</th>
                <th>Broadcasts</th>
                <th>Delivered</th>
                <th>Opened</th>
                <th>Clicked</th>
                <th>Open Rate</th>
                <th>Click Rate</th>
              </tr>
            </thead>
            <tbody>
              {folders.map((folder) => (
                <FolderRow
                  key={`folder-${folder.id}`}
                  folder={folder}
                  segments={segments}
                  depth={0}
                  expandedFolders={expandedFolders}
                  toggleFolder={toggleFolder}
                  onMove={handleMove}
                  onRename={handleRename}
                  allFolders={folders}
                />
              ))}
              {unfolderedSegments.length > 0 && (
                <>
                  {folders.length > 0 && (
                    <tr>
                      <td
                        className="table-cell py-2 text-xs font-medium uppercase tracking-wide"
                        style={{ color: "var(--text-muted)" }}
                        colSpan={8}
                      >
                        Uncategorized
                      </td>
                    </tr>
                  )}
                  {unfolderedSegments.map((seg) => (
                    <SegmentRow
                      key={seg.id}
                      segment={seg}
                      depth={0}
                      onMove={handleMove}
                      onRename={handleRename}
                      allFolders={folders}
                    />
                  ))}
                </>
              )}
              {segments.length === 0 ? (
                <tr>
                  <td
                    className="table-cell py-12 text-center"
                    style={{ color: "var(--text-muted)" }}
                    colSpan={8}
                  >
                    No segments found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {showImportModal && (
        <ImportCsvModal
          segments={segments}
          onClose={() => setShowImportModal(false)}
          onImported={reload}
        />
      )}
    </div>
  );
}
