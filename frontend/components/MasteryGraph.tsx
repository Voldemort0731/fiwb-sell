"use client";
import React, { useEffect, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position,
  useReactFlow,
  ReactFlowProvider
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 200;
const nodeHeight = 60;

const getLayoutedElements = (nodes: any[], edges: any[], direction = 'TB') => {
  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      targetPosition: 'top',
      sourcePosition: 'bottom',
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });

  return { nodes: newNodes, edges };
};

// Custom Node Component
const ConceptNode = ({ data }: any) => {
  const score = data.score || 0;
  
  let color = '#E24B4A'; // Weak (Red)
  let bg = '#FCEBEB';
  let text = '#501313';
  let label = 'Weak';
  
  if (score >= 0.8) {
    color = '#1D9E75'; // Strong (Green)
    bg = '#E1F5EE';
    text = '#085041';
    label = 'Strong';
  } else if (score >= 0.6) {
    color = '#378ADD'; // Good (Blue)
    bg = '#E6F1FB';
    text = '#0C447C';
    label = 'Good';
  } else if (score >= 0.4) {
    color = '#EF9F27'; // Growing (Amber)
    bg = '#FAEEDA';
    text = '#633806';
    label = 'Growing';
  }

  return (
    <div style={{
      padding: '10px 14px',
      borderRadius: '8px',
      background: '#ffffff',
      border: `2px solid ${color}`,
      width: '200px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
      position: 'relative'
    }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.label}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: '4px', background: bg, color: text, fontWeight: 500 }}>
          {label}
        </span>
        <span style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>{Math.round(score * 100)}%</span>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
};

const nodeTypes = {
  custom: ConceptNode,
};

interface MasteryGraphProps {
  data: { nodes: any[], edges: any[] };
  onConceptClick?: (conceptName: string, score: number) => void;
  height?: number | string;
}

function MasteryGraphContent({ data, onConceptClick, height }: MasteryGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { fitView } = useReactFlow();

  const lastDataRef = React.useRef<string>("");

  useEffect(() => {
    const dataString = JSON.stringify(data);
    if (dataString === lastDataRef.current) return;
    lastDataRef.current = dataString;

    if (data && data.nodes && data.nodes.length > 0) {
      const formattedNodes = data.nodes.map(n => ({
        ...n,
        type: 'custom',
      }));
      const formattedEdges = data.edges.map(e => ({
        ...e,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#ccc' },
        style: { stroke: '#ccc', strokeWidth: 2 },
      }));
      const layouted = getLayoutedElements(formattedNodes, formattedEdges);
      setNodes(layouted.nodes);
      setEdges(layouted.edges);
      
      // Auto-fit after layout
      setTimeout(() => fitView({ padding: 0.2, duration: 800 }), 100);
    }
  }, [data, setNodes, setEdges, fitView]);

  return (
    <div style={{ height: height || 500, width: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => onConceptClick?.(node.data.label, node.data.score)}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.2}
        maxZoom={1.5}
      >
        <Background color="#f0f0f0" gap={20} />
        <Controls />
      </ReactFlow>
    </div>
  );
}

export default function MasteryGraph(props: MasteryGraphProps) {
  if (!props.data || !props.data.nodes || props.data.nodes.length === 0) {
    return (
      <div style={{ height: props.height || 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9f9f9', borderRadius: 12, border: '1px dashed #ddd' }}>
        <p style={{ color: '#999' }}>Neural graph generating from curriculum...</p>
      </div>
    );
  }
  
  return (
    <ReactFlowProvider>
      <MasteryGraphContent {...props} />
    </ReactFlowProvider>
  );
}
