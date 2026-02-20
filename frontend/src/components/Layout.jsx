import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Radio,
  Users,
  Layers,
  RefreshCw,
  Trash2,
  Sun,
  Moon,
  Loader2,
  Mail
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/broadcasts", label: "Broadcasts", icon: Radio },
  { to: "/users", label: "Users", icon: Users },
  { to: "/segments", label: "Segments", icon: Layers }
];

export default function Layout({
  onSync,
  syncing,
  onClear,
  clearing,
  syncMessage,
  busy,
  busyLabel
}) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg-primary)" }}>
      <header
        className="sticky top-0 z-40 border-b backdrop-blur-md"
        style={{
          borderColor: "var(--border-color)",
          backgroundColor: theme === "dark" ? "rgba(34, 29, 30, 0.8)" : "rgba(250, 248, 218, 0.8)"
        }}
      >
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 lg:px-8">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-lg"
                style={{ backgroundColor: "var(--accent)" }}
              >
                <Mail className="h-5 w-5 text-white" />
              </div>
              <h1
                className="text-lg font-bold tracking-tight"
                style={{ color: "var(--text-primary)" }}
              >
                Maya
              </h1>
            </div>
            <nav className="hidden items-center gap-1 md:flex">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/"}
                    className={({ isActive }) =>
                      `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
                        isActive
                          ? "bg-brand-600 text-white"
                          : "hover:bg-carbon-100 dark:hover:bg-carbon-800"
                      }`
                    }
                    style={({ isActive }) =>
                      isActive
                        ? {}
                        : { color: "var(--text-secondary)" }
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="btn-ghost rounded-lg p-2"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </button>

            <button
              type="button"
              onClick={onClear}
              disabled={clearing || syncing}
              className="btn-secondary hidden sm:inline-flex"
            >
              {clearing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              <span className="hidden lg:inline">Clear Data</span>
            </button>

            <button
              type="button"
              onClick={onSync}
              disabled={syncing || clearing}
              className="btn-primary"
            >
              {syncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span>{syncing ? "Syncing..." : "Sync"}</span>
            </button>
          </div>
        </div>

        {syncMessage ? (
          <div
            className="mx-auto w-full max-w-7xl border-t px-4 py-2 text-xs lg:px-8"
            style={{ borderColor: "var(--border-color)", color: "var(--text-muted)" }}
          >
            {syncMessage}
          </div>
        ) : null}

        <nav
          className="flex items-center gap-1 overflow-x-auto border-t px-4 py-2 md:hidden lg:px-8"
          style={{ borderColor: "var(--border-color)" }}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-brand-600 text-white"
                      : "hover:bg-carbon-100 dark:hover:bg-carbon-800"
                  }`
                }
                style={({ isActive }) =>
                  isActive
                    ? {}
                    : { color: "var(--text-secondary)" }
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-8">
        <Outlet />
      </main>

      {busy ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
          style={{ backgroundColor: "rgba(34, 29, 30, 0.5)" }}
        >
          <div
            className="w-full max-w-sm rounded-2xl border p-6 text-center shadow-2xl"
            style={{
              backgroundColor: "var(--bg-secondary)",
              borderColor: "var(--border-color)"
            }}
          >
            <Loader2
              className="mx-auto h-8 w-8 animate-spin"
              style={{ color: "var(--accent)" }}
            />
            <p
              className="mt-4 text-base font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {busyLabel || "Please wait..."}
            </p>
            <p
              className="mt-2 text-sm"
              style={{ color: "var(--text-muted)" }}
            >
              Actions are temporarily disabled.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
