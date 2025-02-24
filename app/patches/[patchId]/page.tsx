
"use client";

import { useParams } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChatSidebar } from "@/components/ChatSidebar";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const initialNodes = [
  { id: '1', position: { x: 0, y: 0 }, data: { label: '1' } },
  { id: '2', position: { x: 0, y: 100 }, data: { label: '2' } },
];

const initialEdges = [{ id: 'e1-2', source: '1', target: '2' }];

export default function PatchPage() {
  const params = useParams();
  const patchId = params.patchId as string;
  const [gearMessages, setGearMessages] = useState<{ role: string; content: string }[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  const handleMessageSent = (message: { role: string; content: string }) => {
    setGearMessages((prev) => [...prev, message]);
  };

  return (
    <div className="container mx-auto p-4 flex h-screen">
      <div className="flex-1 pr-4">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Patch {patchId}</CardTitle>
          </CardHeader>
          <CardContent className="h-[calc(100%-4rem)]">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              fitView
            >
              <Controls />
              <MiniMap />
              <Background variant="dots" gap={12} size={1} />
            </ReactFlow>
          </CardContent>
        </Card>
      </div>
      <div className="w-1/3 border-l pl-4">
        <ChatSidebar
          gearId={patchId}
          initialMessages={gearMessages}
          onMessageSent={handleMessageSent}
        />
      </div>
    </div>
  );
}
