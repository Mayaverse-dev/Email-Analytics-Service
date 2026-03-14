import { NavLink, Link, Outlet } from "react-router-dom";
import {
  Radio,
  Users,
  Layers,
  RefreshCw,
  Sun,
  Moon,
  Loader2
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";

const navItems = [
  { to: "/broadcasts", label: "Broadcasts", icon: Radio },
  { to: "/users", label: "Users", icon: Users },
  { to: "/segments", label: "Segments", icon: Layers }
];

export default function Layout({
  onSync,
  syncing,
  onClear,
  clearing,
  busy,
  busyLabel
}) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg-primary)" }}>
      <header
        className="sticky top-0 z-40 backdrop-blur-md"
        style={{
          backgroundColor: theme === "dark" ? "rgba(34, 29, 30, 0.8)" : "rgba(250, 248, 218, 0.8)"
        }}
      >
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 lg:px-8">
          <Link to="/" className="flex flex-col items-center justify-center gap-2">
            <img
              src="/maya.webp"
              alt="Maya"
              className="h-12 w-auto object-contain"
            />
            <span
              className="text-xs font-semibold uppercase tracking-[0.28em]"
              style={{ color: "var(--text-primary)" }}
            >
              Mail Analytics
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <nav className="hidden items-center gap-1 md:flex">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
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
              onClick={onSync}
              disabled={syncing}
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

        <nav
          className="flex items-center gap-1 overflow-x-auto px-4 py-2 md:hidden lg:px-8"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
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
