"use client";

import { useLayout } from "@/contexts/LayoutContext";
import { Breadcrumb } from "./Breadcrumb";
import { UserMenu } from "./UserMenu";

export function Header() {
  const { sidebarOpen, setSidebarOpen, isMobile } = useLayout();

  return (
    <header className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur border-b border-slate-800">
      <div className="flex items-center justify-between h-16 px-4 md:px-6">
        {/* Left side: hamburger + breadcrumb */}
        <div className="flex items-center gap-4">
          {/* Menu toggle - mobile always visible, desktop only when sidebar closed */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors ${
              !isMobile && sidebarOpen ? "hidden" : ""
            }`}
            aria-label={sidebarOpen ? "Chiudi menu" : "Apri menu"}
            title="Toggle sidebar (⌘/Ctrl + B)"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>

          {/* Breadcrumb */}
          <Breadcrumb />
        </div>

        {/* Right side: actions + user menu */}
        <div className="flex items-center gap-2">
          {/* Search button (placeholder for future) */}
          <button
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            aria-label="Cerca"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </button>

          {/* User menu */}
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
