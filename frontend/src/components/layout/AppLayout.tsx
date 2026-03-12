"use client";

import { ReactNode } from "react";
import { LayoutProvider, useLayout } from "@/contexts/LayoutContext";
import { BreadcrumbProvider } from "@/contexts/BreadcrumbContext";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { BottomNav } from "./BottomNav";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <LayoutProvider>
      <BreadcrumbProvider>
        <AppLayoutInner>{children}</AppLayoutInner>
      </BreadcrumbProvider>
    </LayoutProvider>
  );
}

function AppLayoutInner({ children }: AppLayoutProps) {
  const { sidebarWidth, sidebarOpen, isMobile } = useLayout();

  // Calculate left padding based on sidebar state
  const contentStyle = {
    paddingLeft: !isMobile && sidebarOpen ? `${sidebarWidth}px` : 0,
  };

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Sidebar - desktop/tablet */}
      <Sidebar />

      {/* Main content area */}
      <div
        style={contentStyle}
        className="transition-all duration-300"
      >
        {/* Header */}
        <Header />

        {/* Page content */}
        <main className="min-h-[calc(100vh-4rem)] pb-20 md:pb-0">
          {children}
        </main>
      </div>

      {/* Bottom nav - mobile only */}
      <BottomNav />
    </div>
  );
}
