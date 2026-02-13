import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { clearSyncedData, getSyncStatus, triggerSync } from "./api/client";
import BroadcastDetailPage from "./pages/BroadcastDetailPage";
import BroadcastsPage from "./pages/BroadcastsPage";
import DashboardPage from "./pages/DashboardPage";
import SegmentDetailPage from "./pages/SegmentDetailPage";
import SegmentsPage from "./pages/SegmentsPage";
import UserDetailPage from "./pages/UserDetailPage";
import UsersPage from "./pages/UsersPage";

export default function App() {
  const [syncing, setSyncing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function loadSyncStatus() {
      try {
        const status = await getSyncStatus();
        if (!mounted) return;
        if (status.status && status.status !== "never_synced") {
          setSyncMessage(
            `Last sync: ${status.status} (${Number(status.events_processed || 0)} events processed)`
          );
        }
      } catch {
        if (mounted) setSyncMessage("Sync status unavailable");
      }
    }
    loadSyncStatus();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleSync() {
    try {
      setSyncing(true);
      setSyncMessage("Sync started...");
      const response = await triggerSync();
      const eventsProcessed = Number(response?.result?.events_processed || 0);
      const recipientsSynced = Number(response?.result?.recipients_synced || 0);
      setSyncMessage(
        `Sync completed: ${eventsProcessed} events processed, ${recipientsSynced} recipients updated`
      );
      setDataVersion((value) => value + 1);
    } catch (error) {
      setSyncMessage(`Sync failed: ${error.message || "Unknown error"}`);
    } finally {
      setSyncing(false);
    }
  }

  async function handleClearSyncedData() {
    const confirmed = window.confirm(
      "This will permanently delete all synced analytics data (broadcasts, users, segments, sync history). Webhook source event tables will NOT be changed.\n\nDo you want to continue?"
    );
    if (!confirmed) {
      return;
    }

    const finalCheck = window.prompt('Type "CLEAR" to confirm destructive action:');
    if (finalCheck !== "CLEAR") {
      setSyncMessage("Clear action cancelled.");
      return;
    }

    try {
      setClearing(true);
      setSyncMessage("Clearing synced analytics data...");
      const response = await clearSyncedData();
      setSyncMessage(response?.message || "Synced analytics data cleared.");
      setDataVersion((value) => value + 1);
    } catch (error) {
      setSyncMessage(`Clear failed: ${error.message || "Unknown error"}`);
    } finally {
      setClearing(false);
    }
  }

  const busy = syncing || clearing;
  const busyLabel = syncing
    ? "Sync in progress..."
    : clearing
      ? "Clearing synced data..."
      : "";

  return (
    <Routes>
      <Route
        path="/"
        element={
          <Layout
            onSync={handleSync}
            syncing={syncing}
            onClear={handleClearSyncedData}
            clearing={clearing}
            syncMessage={syncMessage}
            busy={busy}
            busyLabel={busyLabel}
          />
        }
      >
        <Route index element={<DashboardPage refreshToken={dataVersion} />} />
        <Route path="broadcasts" element={<BroadcastsPage refreshToken={dataVersion} />} />
        <Route path="broadcasts/:id" element={<BroadcastDetailPage refreshToken={dataVersion} />} />
        <Route path="users" element={<UsersPage refreshToken={dataVersion} />} />
        <Route path="users/:email" element={<UserDetailPage refreshToken={dataVersion} />} />
        <Route path="segments" element={<SegmentsPage refreshToken={dataVersion} />} />
        <Route path="segments/:id" element={<SegmentDetailPage refreshToken={dataVersion} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
