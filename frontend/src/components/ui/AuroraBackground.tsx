"use client";

export function AuroraBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-[#020617]">
      {/* Purple blob - top left */}
      <div
        className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-purple-900/30 rounded-full blur-3xl"
        style={{ animation: 'pulse 8s ease-in-out infinite' }}
      />
      {/* Blue blob - bottom right */}
      <div
        className="absolute -bottom-40 -right-40 w-[600px] h-[600px] bg-blue-900/30 rounded-full blur-3xl"
        style={{ animation: 'pulse 8s ease-in-out infinite 4s' }}
      />
      {/* Subtle center glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-purple-900/10 rounded-full blur-3xl"
      />
    </div>
  );
}
