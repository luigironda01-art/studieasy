"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface LayoutContextType {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  isMobile: boolean;
  sidebarRefreshKey: number;
  refreshSidebar: () => void;
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

const STORAGE_KEY = "studio_layout_prefs";
const DEFAULT_SIDEBAR_WIDTH = 256; // 16rem
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 400;

interface LayoutPreferences {
  sidebarOpen: boolean;
  sidebarWidth: number;
}

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpenState] = useState(true);
  const [sidebarWidth, setSidebarWidthState] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isMobile, setIsMobile] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  const [chatOpen, setChatOpenState] = useState(false);

  const setChatOpen = (open: boolean) => {
    setChatOpenState(open);
  };

  const refreshSidebar = () => {
    setSidebarRefreshKey(prev => prev + 1);
  };

  // Load preferences from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const prefs: LayoutPreferences = JSON.parse(stored);
        setSidebarOpenState(prefs.sidebarOpen ?? true);
        setSidebarWidthState(prefs.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH);
      } catch {
        // Invalid JSON, use defaults
      }
    }
    setIsHydrated(true);
  }, []);

  // Check for mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth < 768) {
        setSidebarOpenState(false);
      }
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Keyboard shortcut: Cmd/Ctrl + B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        setSidebarOpenState(prev => {
          const newState = !prev;
          savePreferences(newState, sidebarWidth);
          return newState;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sidebarWidth]);

  // Save preferences to localStorage
  const savePreferences = (open: boolean, width: number) => {
    const prefs: LayoutPreferences = { sidebarOpen: open, sidebarWidth: width };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  };

  const setSidebarOpen = (open: boolean) => {
    setSidebarOpenState(open);
    savePreferences(open, sidebarWidth);
  };

  const setSidebarWidth = (width: number) => {
    const clampedWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, width));
    setSidebarWidthState(clampedWidth);
    savePreferences(sidebarOpen, clampedWidth);
  };

  // Show loading skeleton during hydration to prevent blank screen
  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-slate-400">Caricamento...</p>
        </div>
      </div>
    );
  }

  return (
    <LayoutContext.Provider
      value={{
        sidebarOpen,
        setSidebarOpen,
        sidebarWidth,
        setSidebarWidth,
        isMobile,
        sidebarRefreshKey,
        refreshSidebar,
        chatOpen,
        setChatOpen,
      }}
    >
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  const context = useContext(LayoutContext);
  if (context === undefined) {
    throw new Error("useLayout must be used within a LayoutProvider");
  }
  return context;
}
