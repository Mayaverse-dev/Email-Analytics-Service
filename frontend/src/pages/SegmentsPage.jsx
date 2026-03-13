import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Layers, Loader2, FolderOpen, FolderClosed, ChevronRight, ChevronDown, ArrowRightLeft, Pencil, Check, X } from "lucide-react";
import { getSegments, getSegmentFolders, moveSegmentToFolder, renameSegment } from "../api/client";
import { fmtInt, fmtPercent } from "../utils/format";

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

export default function SegmentsPage({ refreshToken = 0 }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [segments, setSegments] = useState([]);
  const [folders, setFolders] = useState([]);
  const [expandedFolders, setExpandedFolders] = useState(new Set());

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
          setSegments(segRes.data || []);
          setFolders(folderRes.folders || []);
          const allIds = new Set();
          function collectIds(list) {
            for (const f of list) {
              allIds.add(f.id);
              if (f.children) collectIds(f.children);
            }
          }
          collectIds(folderRes.folders || []);
          setExpandedFolders(allIds);
        }
      } catch (err) {
        if (mounted) setError(err.message || "Failed to load segments");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [refreshToken]);

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
    </div>
  );
}
