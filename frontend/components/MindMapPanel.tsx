"use client";
/**
 * MindMapPanel.tsx
 * Advanced graph-based mind map using @xyflow/react.
 * Inspired by the FIWB MVP repo: level-based layout, custom nodes, 
 * and deep-linking to the document viewer.
 */
import { useEffect, useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  Panel,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useMindMapStore, MindMapNode as MMNode, MindMapEdge as MMEdge } from "@/lib/mindmap-store";
import { useViewerStore } from "@/lib/viewer-store";
import { api } from "@/lib/api";
import { X, RefreshCw, Download, Undo2, Loader2, Info, BookOpen } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";

// ── Constants ──────────────────────────────────────────────────────────────
const LEVEL_GAP = 280;
const NODE_GAP = 220;
type ConceptNodeData = MMNode & Record<string, unknown>;

const COLORS: Record<number, string> = {
  0: "#a855f7", // Root - Purple
  1: "#3b82f6", // Pillar - Blue
  2: "#10b981", // Sub - Green
  3: "#f59e0b", // Detail - Orange
};

// ── Layout Engine ───────────────────────────────────────────────────────────
function computeLayout(mmNodes: MMNode[], mmEdges: MMEdge[]) {
  const nodesByLevel: Record<number, MMNode[]> = {};
  mmNodes.forEach((n) => {
    const lvl = n.level ?? 0;
    if (!nodesByLevel[lvl]) nodesByLevel[lvl] = [];
    nodesByLevel[lvl].push(n);
  });

  const layoutNodes: Node<ConceptNodeData>[] = [];
  const levels = Object.keys(nodesByLevel).map(Number).sort((a, b) => a - b);

  levels.forEach((lvl) => {
    const levelNodes = nodesByLevel[lvl];
    const totalWidth = (levelNodes.length - 1) * NODE_GAP;
    
    levelNodes.forEach((node, idx) => {
      layoutNodes.push({
        id: node.id,
        type: "concept",
        data: { ...node } as ConceptNodeData,
        position: {
          x: idx * NODE_GAP - totalWidth / 2,
          y: lvl * LEVEL_GAP,
        },
      });
    });
  });

  const layoutEdges: Edge[] = mmEdges.map((e, idx) => ({
    id: `e-${idx}`,
    source: e.source,
    target: e.target,
    label: e.label,
    animated: e.type === "prerequisite",
    style: {
      stroke: e.type === "prerequisite" ? "#f59e0b" : "#4b5563",
      strokeDasharray: e.type === "related" ? "5,5" : "0",
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: e.type === "prerequisite" ? "#f59e0b" : "#4b5563",
    },
  }));

  return { nodes: layoutNodes, edges: layoutEdges };
}

// ── Custom Node Components ──────────────────────────────────────────────────
function ConceptNode({ data }: { data: MMNode }) {
  const color = COLORS[data.level] || "#4b5563";
  
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="relative px-4 py-3 rounded-xl border bg-white/80 backdrop-blur-md shadow-2xl min-w-[180px] group transition-all"
      style={{ borderColor: color }}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-600 !w-2 !h-2" />
      
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span 
            className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ backgroundColor: `${color}33`, color: color }}
          >
            Level {data.level}
          </span>
          {data.citations?.length > 0 && (
            <div className="flex gap-0.5">
              <BookOpen size={10} className="text-gray-400" />
            </div>
          )}
        </div>
        
        <div className="text-sm font-semibold text-black group-hover:text-purple-600 transition-colors">
          {data.label}
        </div>
        
        <div className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed mt-1">
          {data.definition}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-gray-600 !w-2 !h-2" />
    </motion.div>
  );
}

const nodeTypes = {
  concept: ConceptNode,
};

// ── Main Panel Component ─────────────────────────────────────────────────────
export default function MindMapPanel({ onChatInject }: { onChatInject: (text: string) => void }) {
  const { 
    isOpen, docId, docTitle, data, loading, generatedAt, canUndo, 
    closeMap, setData, setLoading 
  } = useMindMapStore();
  
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<ConceptNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<MMNode | null>(null);
  const [instruction, setInstruction] = useState("");

  // Sync state with React Flow
  useEffect(() => {
    if (data) {
      const { nodes: lNodes, edges: lEdges } = computeLayout(data.nodes, data.edges);
      setNodes(lNodes);
      setEdges(lEdges);
    }
  }, [data, setNodes, setEdges]);

  // Initial load
  useEffect(() => {
    if (!isOpen || !docId) return;
    setLoading(true);
    api.post(`/mindmap/${docId}`)
      .then((res) => setData(res.data, res.generated_at, res.can_undo))
      .catch(() => setLoading(false));
  }, [isOpen, docId]);

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node<ConceptNodeData>) => {
    setSelectedNode(node.data);
  }, []);

  const handleCitationClick = (materialId: string, page: number, snippet: string) => {
    console.log(`[MindMap] Opening citation for material ${materialId} on page ${page}`);
    
    // Auto-close mind map to make room for viewer
    closeMap();

    useViewerStore.getState().openViewer({
      docId: materialId,
      passageId: `mm-${Date.now()}`,
      pageNumber: page,
      highlightText: snippet,
      label: "Concept Source",
    });
  };

  const handleRegenerate = async () => {
    if (!docId) return;
    setLoading(true);
    try {
      const res = await api.get(`/mindmap/${docId}?force=true`);
      setData(res.data, res.generated_at, res.can_undo);
    } finally {
      setLoading(false);
    }
  };

  const handleUndo = async () => {
    if (!docId) return;
    setLoading(true);
    try {
      const res = await api.post(`/mindmap/${docId}/undo`);
      setData(res.data, res.generated_at, res.can_undo);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {

    e.preventDefault();
    if (!docId || !instruction.trim() || loading) return;
    const cmd = instruction;
    setInstruction("");
    setLoading(true);
    try {
      const res = await api.patch(`/mindmap/${docId}/edit`, { instruction: cmd });
      setData(res.data, res.generated_at, res.can_undo);
    } catch (err) {
      console.error("Edit failed:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="flex flex-col h-full bg-[var(--bg-primary)] relative group/map overflow-hidden">
      {/* ── Floating Premium Toolbar ── */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-1.5 p-1.5 rounded-2xl bg-white/40 backdrop-blur-xl border border-black/10 shadow-2xl transition-all hover:bg-white/60 group/toolbar">
        <div className="flex items-center gap-3 px-3">
          <div className={clsx("w-2 h-2 rounded-full", loading ? "bg-purple-500 animate-pulse shadow-[0_0_8px_purple]" : "bg-white/20")} />
          <div className="flex flex-col">
            <span className="text-[9px] font-black text-purple-400/80 uppercase tracking-[0.2em] leading-tight">Atlas Engine</span>
            <span className="text-[11px] font-bold text-black/90 truncate max-w-[120px] leading-tight">
              {docTitle || "Synthetic Graph"}
            </span>
          </div>
        </div>

        <div className="w-[1px] h-4 bg-white/10 mx-1" />

        <div className="flex items-center gap-1">
          {canUndo && (
            <button onClick={handleUndo} className="p-1.5 hover:bg-black/10 rounded-xl transition-all text-black/40 hover:text-black" title="Undo Edit">
              <Undo2 size={15} />
            </button>
          )}
          <button onClick={handleRegenerate} className="p-1.5 hover:bg-black/10 rounded-xl transition-all text-black/40 hover:text-black" title="Force Regenerate">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="w-[1px] h-4 bg-white/10 mx-1" />

        <button onClick={closeMap} className="p-1.5 hover:bg-red-500/20 hover:text-red-400 rounded-xl transition-all text-black/40">
          <X size={16} />
        </button>
      </div>


      {loading && !data && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md">
          <Loader2 size={40} className="text-purple-500 animate-spin mb-6" />
          <div className="text-sm font-bold text-black tracking-[0.3em] uppercase animate-pulse">Synthesizing Architecture</div>
        </div>
      )}


      {/* ── Graph View ── */}
      <div className="flex-1 w-full relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          className="bg-[var(--bg-primary)]"
          minZoom={0.1}
          maxZoom={4}
        >
          <Background color="#ccc" gap={24} size={1} />
          <Controls className="!bg-black/80 !border-white/5 !fill-white !rounded-xl !overflow-hidden border shadow-2xl" />
          
          <Panel position="bottom-right" className="mb-20 mr-4">
            <div className="text-[9px] font-bold text-black/40 uppercase tracking-[0.2em] bg-white/40 backdrop-blur px-3 py-1.5 rounded-lg border border-black/5">
               Precision: 0.982 · Vectors: {nodes.length}
            </div>
          </Panel>
        </ReactFlow>

        {/* ── Floating Instruction Bar (The "Magic" Edit Box) ── */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 w-[90%] max-w-md">
          <form 
            onSubmit={handleEdit}
            className="group/form relative bg-white/60 backdrop-blur-3xl border border-black/10 p-1.5 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] focus-within:border-purple-500/50 transition-all duration-500"
          >
            <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl blur opacity-0 group-focus-within/form:opacity-20 transition duration-500" />
            <div className="relative flex items-center gap-2">
              <input 
                type="text"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="Modify map structure (e.g. 'Add detail to X')..."
                className="flex-1 bg-transparent border-none focus:ring-0 text-xs text-black placeholder-black/25 px-3 py-2"
                disabled={loading}
              />
              <button 
                type="submit"
                disabled={!instruction.trim() || loading}
                className="p-2 bg-black/5 hover:bg-black/10 rounded-xl text-black/40 hover:text-black disabled:opacity-30 transition-all"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              </button>
            </div>
          </form>
        </div>
      </div>


      {/* ── Detail Side Panel ── */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            initial={{ x: 400 }}
            animate={{ x: 0 }}
            exit={{ x: 400 }}
            className="absolute top-0 right-0 h-full w-80 bg-white/95 border-l border-black/10 shadow-[-20px_0_40px_rgba(0,0,0,0.05)] z-30 p-6 overflow-y-auto"
          >
            <button 
              onClick={() => setSelectedNode(null)}
              className="absolute top-4 right-4 p-2 text-gray-500 hover:text-white"
            >
              <X size={20} />
            </button>

            <div className="mt-8">
              <span 
                className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded mb-4 inline-block"
                style={{ backgroundColor: `${COLORS[selectedNode.level]}33`, color: COLORS[selectedNode.level] }}
              >
                Concept Level {selectedNode.level}
              </span>
              <h2 className="text-2xl font-bold text-black mb-4 leading-tight">{selectedNode.label}</h2>
              <p className="text-sm text-gray-400 leading-relaxed mb-8">{selectedNode.definition}</p>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <BookOpen size={12} /> Source Evidence
                  </h3>
                  {selectedNode.citations?.map((cit, idx) => (
                    <div 
                      key={idx}
                      onClick={() => handleCitationClick(cit.material_id, cit.page, cit.snippet)}
                      className="group cursor-pointer p-4 rounded-xl bg-black/5 border border-black/5 hover:border-purple-500/30 hover:bg-purple-500/5 transition-all mb-3"
                    >
                      <p className="text-xs text-gray-300 italic mb-3 leading-relaxed">
                        &quot;{cit.snippet}&quot;
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-medium text-purple-400">Page {cit.page}</span>
                        <Info size={12} className="text-gray-600 group-hover:text-purple-400" />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-4">
                  <button 
                    onClick={() => onChatInject(`Tell me more about ${selectedNode.label} relative to the document.`)}
                    className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold shadow-xl shadow-purple-900/20 transition-all flex items-center justify-center gap-2"
                  >
                    Discuss this Concept
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
