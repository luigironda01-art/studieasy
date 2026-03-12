"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

export function UserMenu() {
  const { user } = useAuth();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close on escape
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  // Get initials for avatar
  const getInitials = () => {
    if (!user?.email) return "?";
    return user.email.charAt(0).toUpperCase();
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* Avatar button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
          <span className="text-white text-sm font-medium">{getInitials()}</span>
        </div>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-slate-800 rounded-xl border border-slate-700 shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* User info */}
          <div className="px-4 py-3 border-b border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                <span className="text-white font-medium">{getInitials()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium truncate">
                  {user?.user_metadata?.full_name || "Utente"}
                </p>
                <p className="text-slate-400 text-sm truncate">{user?.email}</p>
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div className="py-2">
            <MenuItem href="/settings" icon="👤" label="Profilo" onClick={() => setIsOpen(false)} />
            <MenuItem href="/settings" icon="⚙️" label="Impostazioni" onClick={() => setIsOpen(false)} />

            {/* Theme toggle */}
            <div className="px-4 py-2 flex items-center justify-between">
              <span className="text-slate-400 text-sm">Tema</span>
              <div className="flex items-center gap-1 bg-slate-700 rounded-lg p-1">
                <button
                  className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-600 transition-colors"
                  title="Tema chiaro"
                >
                  ☀️
                </button>
                <button
                  className="p-1.5 rounded bg-slate-600 text-white"
                  title="Tema scuro"
                >
                  🌙
                </button>
              </div>
            </div>
          </div>

          {/* Logout */}
          <div className="py-2 border-t border-slate-700">
            <button
              onClick={handleLogout}
              className="w-full px-4 py-2 text-left text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-3"
            >
              <span>🚪</span>
              <span>Esci</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface MenuItemProps {
  href: string;
  icon: string;
  label: string;
  onClick?: () => void;
}

function MenuItem({ href, icon, label, onClick }: MenuItemProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-2 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
    >
      <span>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}
