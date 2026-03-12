"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

interface NavItem {
  label: string;
  href: string;
  icon: string;
  activeIcon: string;
  badge?: number;
}

export function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [dueCards, setDueCards] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  // Fetch due cards count
  useEffect(() => {
    if (!user) return;

    const fetchDueCards = async () => {
      const now = new Date().toISOString();
      const { count } = await supabase
        .from("flashcards")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .lte("due", now);

      setDueCards(count || 0);
    };

    fetchDueCards();
  }, [user]);

  // Hide on scroll down, show on scroll up
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        setIsVisible(false);
      } else {
        setIsVisible(true);
      }

      setLastScrollY(currentScrollY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY]);

  const navItems: NavItem[] = [
    { label: "Studia", href: "/dashboard", icon: "📚", activeIcon: "📖" },
    { label: "Sessione", href: "/dashboard/study", icon: "🎯", activeIcon: "🎯", badge: dueCards > 0 ? dueCards : undefined },
    { label: "Stats", href: "/stats", icon: "📊", activeIcon: "📈" },
    { label: "Feedback", href: "/feedback", icon: "💬", activeIcon: "💬" },
    { label: "Profilo", href: "/settings", icon: "👤", activeIcon: "👤" },
  ];

  const isActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === "/dashboard" || pathname.startsWith("/dashboard/source");
    }
    return pathname.startsWith(href);
  };

  return (
    <nav
      className={`md:hidden fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700 z-40 transition-transform duration-300 ${
        isVisible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 py-2 relative transition-colors ${
                active ? "text-blue-400" : "text-slate-400"
              }`}
            >
              <span className="text-xl relative">
                {active ? item.activeIcon : item.icon}
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[10px] font-bold min-w-[16px] h-4 rounded-full flex items-center justify-center px-1">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </span>
              <span className="text-xs mt-1">{item.label}</span>

              {/* Active indicator */}
              {active && (
                <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-8 h-1 bg-blue-500 rounded-full" />
              )}
            </Link>
          );
        })}
      </div>

      {/* Safe area for iOS */}
      <div className="h-safe-area-inset-bottom bg-slate-800" />
    </nav>
  );
}
