import { NavLink, Outlet } from "react-router-dom";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/broadcasts", label: "Broadcasts" },
  { to: "/users", label: "Users" },
  { to: "/segments", label: "Segments" }
];

export default function Layout({ onSync, syncing, syncMessage }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <h1 className="text-lg font-semibold text-slate-900">Maya Email Analytics</h1>
            <nav className="flex items-center gap-4 text-sm">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    isActive ? "font-semibold text-slate-900" : "text-slate-600"
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {syncing ? "Syncing..." : "Sync"}
          </button>
        </div>
        {syncMessage ? (
          <div className="mx-auto w-full max-w-7xl px-4 pb-3 text-xs text-slate-600">{syncMessage}</div>
        ) : null}
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
