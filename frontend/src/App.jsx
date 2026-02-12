import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { getSyncStatus, triggerSync } from "./api/client";
import BroadcastDetailPage from "./pages/BroadcastDetailPage";
import BroadcastsPage from "./pages/BroadcastsPage";
import DashboardPage from "./pages/DashboardPage";
import SegmentDetailPage from "./pages/SegmentDetailPage";
import SegmentsPage from "./pages/SegmentsPage";
import UserDetailPage from "./pages/UserDetailPage";
import UsersPage from "./pages/UsersPage";

export default function App() {
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

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
    } catch (error) {
      setSyncMessage(`Sync failed: ${error.message || "Unknown error"}`);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Routes>
      <Route
        path="/"
        element={<Layout onSync={handleSync} syncing={syncing} syncMessage={syncMessage} />}
      >
        <Route index element={<DashboardPage />} />
        <Route path="broadcasts" element={<BroadcastsPage />} />
        <Route path="broadcasts/:id" element={<BroadcastDetailPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="users/:email" element={<UserDetailPage />} />
        <Route path="segments" element={<SegmentsPage />} />
        <Route path="segments/:id" element={<SegmentDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
