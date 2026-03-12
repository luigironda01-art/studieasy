"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbContextType {
  items: BreadcrumbItem[];
  setItems: (items: BreadcrumbItem[]) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextType | undefined>(undefined);

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<BreadcrumbItem[]>([]);

  return (
    <BreadcrumbContext.Provider value={{ items, setItems }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

export function useBreadcrumbContext() {
  const context = useContext(BreadcrumbContext);
  if (context === undefined) {
    throw new Error("useBreadcrumbContext must be used within a BreadcrumbProvider");
  }
  return context;
}

// Hook for pages to set their breadcrumb
export function useBreadcrumb(items: BreadcrumbItem[]) {
  const { setItems } = useBreadcrumbContext();

  useEffect(() => {
    setItems(items);
    return () => setItems([]);
  }, [JSON.stringify(items), setItems]);
}
