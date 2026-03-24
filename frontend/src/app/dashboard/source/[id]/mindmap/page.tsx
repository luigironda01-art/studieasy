"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import { supabase, Source, Chapter } from "@/lib/supabase";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  ReactFlowProvider,
  useReactFlow,
  BackgroundVariant,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MindmapNode {
  id: string;
  label: string;
  category: "concept" | "principle" | "formula" | "example" | "definition" | "process";
  parent?: string;
}

interface MindmapData {
  centralTopic: string;
  nodes: MindmapNode[];
}

// ─── Colors per category ──────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  concept:    { bg: "#3B82F620", border: "#3B82F6", text: "#93C5FD" },
  principle:  { bg: "#8B5CF620", border: "#8B5CF6", text: "#C4B5FD" },
  formula:    { bg: "#10B98120", border: "#10B981", text: "#6EE7B7" },
  example:    { bg: "#F59E0B20", border: "#F59E0B", text: "#FCD34D" },
  definition: { bg: "#EC489920", border: "#EC4899", text: "#F9A8D4" },
  process:    { bg: "#06B6D420", border: "#06B6D4", text: "#67E8F9" },
};

// ─── Layout: LR tree with expand/collapse (NotebookLM style) ─────────────────

function buildVisibleGraph(
  data: MindmapData,
  expandedNodes: Set<string>,
): { nodes: Node[]; edges: Edge[] } {
  const rfNodes: Node[] = [];
  const rfEdges: Edge[] = [];
  const H_STEP = 350;
  const LEAF_H = 90;
  const GROUP_GAP = 60;

  // Build child map for ALL nodes (not just level 1)
  const childMap: Record<string, MindmapNode[]> = {};
  data.nodes.filter(n => n.parent).forEach(n => {
    if (!childMap[n.parent!]) childMap[n.parent!] = [];
    childMap[n.parent!].push(n);
  });
  const rootNodes = data.nodes.filter(n => !n.parent);

  // Recursive: count visible leaf slots for a node
  const countLeaves = (nodeId: string): number => {
    const children = childMap[nodeId] || [];
    if (children.length === 0 || !expandedNodes.has(nodeId)) return 1;
    return children.reduce((acc, c) => acc + countLeaves(c.id), 0);
  };

  // Recursive: place a node and its visible children
  const placeNode = (
    node: MindmapNode,
    depth: number,
    startY: number,
    parentId: string | null,
  ) => {
    const children = childMap[node.id] || [];
    const hasChildren = children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    const leaves = countLeaves(node.id);
    const nodeY = startY + (leaves * LEAF_H) / 2;
    const colors = CATEGORY_COLORS[node.category] || CATEGORY_COLORS.concept;
    const expandIcon = hasChildren ? (isExpanded ? " ▾" : " ▸") : "";

    // Scale style by depth
    const fontSize = depth === 0 ? 13 : depth === 1 ? 12 : 11;
    const padding = depth <= 1 ? "10px 16px" : "7px 12px";
    const minW = depth === 0 ? 140 : depth === 1 ? 120 : 100;
    const maxW = depth === 0 ? 210 : depth === 1 ? 180 : 160;
    const borderW = depth === 0 ? 2 : 1.5;

    rfNodes.push({
      id: node.id,
      type: "default",
      position: { x: (depth + 1) * H_STEP, y: nodeY },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: { label: node.label + expandIcon },
      style: {
        background: colors.bg,
        border: `${borderW}px solid ${colors.border}`,
        color: colors.text,
        borderRadius: depth === 0 ? "12px" : "10px",
        padding,
        fontWeight: depth === 0 ? 600 : 500,
        fontSize: `${fontSize}px`,
        minWidth: `${minW}px`,
        maxWidth: `${maxW}px`,
        textAlign: "center" as const,
        cursor: hasChildren ? "pointer" : "default",
      },
    });

    if (parentId) {
      rfEdges.push({
        id: `e-${parentId}-${node.id}`,
        source: parentId,
        target: node.id,
        type: "bezier",
        style: { stroke: colors.border, strokeWidth: depth <= 1 ? 2 : 1.5, opacity: 0.5 },
      });
    }

    // Place children recursively
    if (isExpanded && hasChildren) {
      let childY = startY;
      children.forEach((child) => {
        placeNode(child, depth + 1, childY, node.id);
        childY += countLeaves(child.id) * LEAF_H;
      });
    }
  };

  // Place all root nodes with gaps between groups
  const totalLeaves = rootNodes.reduce((acc, n) => acc + countLeaves(n.id), 0);
  const totalH = totalLeaves * LEAF_H + (rootNodes.length - 1) * GROUP_GAP;
  let y = -totalH / 2;

  rootNodes.forEach((node) => {
    const leaves = countLeaves(node.id);
    placeNode(node, 0, y, "center");
    y += leaves * LEAF_H + GROUP_GAP;
  });

  // Central node (leftmost)
  rfNodes.push({
    id: "center",
    type: "default",
    position: { x: 0, y: 0 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: { label: data.centralTopic },
    style: {
      background: "linear-gradient(135deg, #3B82F6, #8B5CF6)",
      color: "#fff",
      border: "none",
      borderRadius: "16px",
      padding: "14px 22px",
      fontWeight: 700,
      fontSize: "15px",
      minWidth: "160px",
      textAlign: "center" as const,
      boxShadow: "0 0 30px rgba(139, 92, 246, 0.4)",
      cursor: "pointer",
    },
  });

  // Edge from center to each root node
  rootNodes.forEach((node) => {
    const colors = CATEGORY_COLORS[node.category] || CATEGORY_COLORS.concept;
    rfEdges.push({
      id: `e-center-${node.id}`,
      source: "center",
      target: node.id,
      type: "bezier",
      style: { stroke: colors.border, strokeWidth: 2, opacity: 0.6 },
    });
  });

  return { nodes: rfNodes, edges: rfEdges };
}

// ─── Inner component (needs ReactFlowProvider context) ────────────────────────

function MindmapInner({
  mindmap,
  onExport,
}: {
  mindmap: MindmapData;
  onExport: (fn: () => void) => void;
}) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const graphRef = useRef({ nodes: [] as Node[], edges: [] as Edge[] });

  // Always compute fresh graph from current state
  const currentGraph = buildVisibleGraph(mindmap, expandedNodes);
  graphRef.current = currentGraph;

  const [nodes, setNodes, onNodesChange] = useNodesState(currentGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(currentGraph.edges);
  const { fitView } = useReactFlow();
  const rfRef = useRef<HTMLDivElement>(null);

  // Rebuild graph when expandedNodes changes
  useEffect(() => {
    const g = buildVisibleGraph(mindmap, expandedNodes);
    setNodes(g.nodes);
    setEdges(g.edges);
    const timer = setTimeout(() => fitView({ padding: 0.2, duration: 250 }), 60);
    return () => clearTimeout(timer);
  }, [expandedNodes, mindmap, setNodes, setEdges, fitView]);

  // Build set of nodes that have children (expandable at any depth)
  const nodesWithChildren = new Set(
    mindmap.nodes.filter(n => n.parent).map(n => n.parent!)
  );

  // Click handler: toggle expand/collapse on ANY node with children
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.id === "center") {
      // Toggle all root nodes
      const rootIds = mindmap.nodes.filter(n => !n.parent).map(n => n.id);
      setExpandedNodes(prev => {
        const anyExpanded = rootIds.some(id => prev.has(id));
        if (anyExpanded) return new Set<string>();
        return new Set<string>(rootIds);
      });
      return;
    }

    if (!nodesWithChildren.has(node.id)) return;

    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(node.id)) {
        // Collapse this node and all its descendants
        next.delete(node.id);
        const removeDescendants = (parentId: string) => {
          mindmap.nodes.filter(n => n.parent === parentId).forEach(child => {
            next.delete(child.id);
            removeDescendants(child.id);
          });
        };
        removeDescendants(node.id);
      } else {
        next.add(node.id);
      }
      return next;
    });
  }, [mindmap, nodesWithChildren]);

  // Export as PNG
  const exportPng = useCallback(async () => {
    if (!rfRef.current) return;
    // Expand ALL nodes that have children for export
    const allExpandable = new Set<string>(
      mindmap.nodes.filter(n => n.parent).map(n => n.parent!)
    );
    setExpandedNodes(allExpandable);
    await new Promise(r => setTimeout(r, 500));

    const h2c = (await import("html2canvas")).default;
    const wrapper = rfRef.current.querySelector(".react-flow__renderer") as HTMLElement;
    const canvas = await h2c(wrapper || rfRef.current, {
      backgroundColor: "#0F172A",
      scale: 2,
      useCORS: true,
      logging: false,
    });
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${mindmap.centralTopic.replace(/\s+/g, "_")}_mappa.png`;
    a.click();
  }, [mindmap]);

  useEffect(() => {
    onExport(exportPng);
  }, [onExport, exportPng]);

  return (
    <div ref={rfRef} style={{ width: "100%", height: "100%" }}>
      <style>{`.react-flow__handle { opacity: 0 !important; width: 1px !important; height: 1px !important; min-width: 0 !important; min-height: 0 !important; border: none !important; }`}</style>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodesDraggable={false}
        nodesConnectable={false}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1E293B" variant={BackgroundVariant.Dots} gap={24} size={1.5} />
        <Controls
          style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px" }}
        />
        <MiniMap
          style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px" }}
          nodeColor={(n) => {
            const border = (n.style?.border as string) || "";
            const match = border.match(/#[0-9A-Fa-f]{6}/);
            return match ? match[0] : "#3B82F6";
          }}
        />
      </ReactFlow>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MindmapPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const sourceId = params.id as string;

  const [source, setSource] = useState<Source | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string>("__all__");
  const [mindmap, setMindmap] = useState<MindmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const exportFnRef = useRef<() => void>(() => {});

  useBreadcrumb(
    source
      ? [
          { label: "I miei libri", href: "/dashboard" },
          { label: source.title, href: `/dashboard/source/${sourceId}` },
          { label: "Mappa Concettuale" },
        ]
      : []
  );

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!authLoading && user && sourceId) fetchData();
  }, [user, authLoading, sourceId]);

  const fetchData = async () => {
    setLoading(true);
    const { data: src } = await supabase.from("sources").select("*").eq("id", sourceId).single();
    if (src) setSource(src);

    const { data: chs } = await supabase
      .from("chapters")
      .select("id, title, processing_status, order_index")
      .eq("source_id", sourceId)
      .eq("processing_status", "completed")
      .order("order_index");
    if (chs) setChapters(chs as Chapter[]);

    // Load existing mindmap for whole book
    const { data: existing } = await supabase
      .from("mindmaps")
      .select("content")
      .eq("source_id", sourceId)
      .eq("user_id", user!.id)
      .is("chapter_id", null)
      .single();
    if (existing) setMindmap(existing.content as MindmapData);

    setLoading(false);
  };

  const handleGenerate = async () => {
    if (!user) return;
    setGenerating(true);
    setError("");

    // Delete existing mindmap first (regenerate)
    await fetch("/api/mindmap/generate", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceId,
        chapterId: selectedChapterId === "__all__" ? null : selectedChapterId,
        userId: user.id,
      }),
    });

    const res = await fetch("/api/mindmap/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceId,
        chapterId: selectedChapterId === "__all__" ? null : selectedChapterId,
        userId: user.id,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setMindmap(data.mindmap);
    } else {
      setError("Errore nella generazione della mappa. Riprova.");
    }
    setGenerating(false);
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href={`/dashboard/source/${sourceId}`}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {source?.title}
          </Link>
          <span className="text-slate-600">/</span>
          <div className="flex items-center gap-2">
            <span className="text-xl">🗺️</span>
            <h1 className="text-white font-semibold">Mappa Concettuale</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Chapter selector */}
          {chapters.length > 1 && (
            <select
              value={selectedChapterId}
              onChange={e => setSelectedChapterId(e.target.value)}
              className="bg-white/5 border border-white/10 text-slate-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500"
            >
              <option value="__all__">Libro intero</option>
              {chapters.map(ch => (
                <option key={ch.id} value={ch.id}>{ch.title}</option>
              ))}
            </select>
          )}

          {/* Export PNG */}
          {mindmap && (
            <button
              onClick={() => exportFnRef.current?.()}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-slate-300 rounded-lg hover:bg-white/10 transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Esporta PNG
            </button>
          )}

          {/* Generate / Regenerate */}
          <button
            onClick={handleGenerate}
            disabled={generating || chapters.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50"
          >
            {generating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Generando...
              </>
            ) : mindmap ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Rigenera
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Genera Mappa
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm shrink-0">
          {error}
        </div>
      )}

      {/* Legend */}
      {mindmap && (
        <div className="flex items-center gap-3 px-6 py-2 shrink-0 flex-wrap">
          {Object.entries(CATEGORY_COLORS).map(([cat, colors]) => (
            <div key={cat} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ background: colors.border }} />
              <span className="text-slate-400 text-xs capitalize">{cat}</span>
            </div>
          ))}
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1 relative">
        {!mindmap && !generating ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <div className="w-24 h-24 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-3xl flex items-center justify-center">
              <span className="text-5xl">🗺️</span>
            </div>
            <h3 className="text-white font-semibold text-xl">Nessuna mappa generata</h3>
            <p className="text-slate-400 text-center max-w-sm">
              Genera una mappa concettuale interattiva del tuo materiale di studio
            </p>
            {chapters.length === 0 && (
              <p className="text-amber-400 text-sm">Elabora prima un capitolo per generare la mappa</p>
            )}
          </div>
        ) : generating ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500" />
            <p className="text-slate-300">Generando la mappa concettuale con Gemini...</p>
          </div>
        ) : (
          <ReactFlowProvider>
            <MindmapInner
              mindmap={mindmap!}
              onExport={fn => { exportFnRef.current = fn; }}
            />
          </ReactFlowProvider>
        )}
      </div>
    </div>
  );
}
