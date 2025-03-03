"use client";

import { useParams } from "next/navigation";
import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
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
  Connection,
  Node,
  Edge,
  BackgroundVariant,
  ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Patch, PatchNode, PatchEdge } from "@/lib/models/Patch";
import { Gear } from "@/lib/models/Gear";

export default function PatchPage() {
  const params = useParams();
  const patchId = params.patchId as string;
  
  const [patchName, setPatchName] = useState<string>("");
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [gearMessages, setGearMessages] = useState<{ id?: string; role: string; content: string }[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState<{ gearId: string; label: string }>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [saving, setSaving] = useState(false);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);

  // Load patch data
  useEffect(() => {
    async function loadPatch() {
      try {
        // Try to load from the model
        let patch = await Patch.findById(patchId);
        
        // If not found in model, try localStorage
        if (!patch && typeof window !== 'undefined') {
          const savedPatches = localStorage.getItem('patches');
          if (savedPatches) {
            const patches = JSON.parse(savedPatches);
            const patchData = patches.find((p: {id: string}) => p.id === patchId);
            
            if (patchData) {
              // Create a new patch in the model
              patch = await Patch.create({
                id: patchId,
                name: patchData.name,
                description: patchData.description || "",
                nodes: patchData.nodes || [],
                edges: patchData.edges || []
              });
            }
          }
        }
        
        // If patch is found or created, set state
        if (patch) {
          setPatchName(patch.name);
          setNodes(patch.nodes);
          setEdges(patch.edges);
        } else {
          // Default empty patch
          setPatchName(`Patch ${patchId}`);
        }
      } catch (error) {
        console.error("Error loading patch:", error);
      }
    }
    
    loadPatch();
  }, [patchId, setNodes, setEdges]);

  // Handle connecting nodes
  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      
      const newEdge: Edge = {
        ...connection,
        id: `e${connection.source}-${connection.target}`,
      };
      
      setEdges((eds) => addEdge(connection, eds));
      
      try {
        const patch = await Patch.findById(patchId);
        if (patch) {
          const sourceNode = nodes.find(n => n.id === connection.source);
          const targetNode = nodes.find(n => n.id === connection.target);
          
          if (sourceNode && targetNode) {
            const patchEdge: PatchEdge = {
              id: newEdge.id,
              source: sourceNode.id,
              target: targetNode.id,
              sourceHandle: connection.sourceHandle || undefined,
              targetHandle: connection.targetHandle || undefined
            };
            
            await patch.addEdge(patchEdge);
          }
        }
      } catch (error) {
        console.error("Error saving edge:", error);
      }
    },
    [setEdges, patchId, nodes],
  );

  // Handle adding a new gear node at a specific position
  const addGearNode = useCallback(async (position = { x: Math.random() * 300, y: Math.random() * 300 }) => {
    try {
      setSaving(true);
      
      // Create a new gear
      const gearId = `gear-${Date.now()}`;
      
      // Add some initial instructions to the gear
      const initialMessages = [
        {
          role: "system",
          content: "You are a Gear that processes inputs and produces outputs. You can be configured with instructions."
        },
        {
          role: "user",
          content: "How do I use this Gear?"
        },
        {
          role: "assistant",
          content: "You can send me instructions or data, and I'll process them according to my configuration. Add specific instructions about what you want me to do with inputs."
        }
      ];
      
      const gear = await Gear.create({
        id: gearId,
        messages: initialMessages,
      });
      
      // Create a node representation
      const nodeId = `node-${Date.now()}`;
      const newNode: PatchNode = {
        id: nodeId,
        type: 'default',
        position,
        data: {
          gearId: gear.id,
          label: `Gear ${gear.id.split('-')[1]}`
        }
      };
      
      // Add to local state
      setNodes(nodes => [...nodes, newNode]);
      
      // Save to the patch
      const patch = await Patch.findById(patchId);
      if (patch) {
        await patch.addNode(newNode);
      }
      
      // Save to backend right away
      try {
        const response = await fetch(`/api/gears/${gearId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            source: 'initialization',
            message: 'Gear created and initialized'
          }),
        });
        
        if (!response.ok) {
          console.warn("Pre-initialization call failed, but continuing");
        }
      } catch (err) {
        console.warn("Failed to pre-initialize gear, but continuing:", err);
      }
    } catch (error) {
      console.error("Error adding gear node:", error);
    } finally {
      setSaving(false);
    }
  }, [patchId, setNodes]);

  // Handle node selection
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node.id);
    
    // Load messages for this gear
    const gearId = node.data?.gearId;
    if (gearId) {
      Gear.findById(gearId).then(gear => {
        if (gear) {
          setGearMessages(gear.messages);
        } else {
          setGearMessages([]);
        }
      }).catch(error => {
        console.error("Error loading gear messages:", error);
        setGearMessages([]);
      });
    }
  }, []);
  
  // Handle canvas click to add a new gear
  const onPaneClick = useCallback((event: React.MouseEvent) => {
    // Don't create a gear if:
    // 1. The reactFlowInstance is not available
    // 2. We're in the middle of making a connection
    if (!reactFlowInstance) return;
    
    // Check if we're connecting nodes (look for connection elements in the DOM)
    const connectingLine = document.querySelector('.react-flow__connection-path');
    if (connectingLine) {
      // If a connection line is present, we're in the middle of making a connection,
      // so don't create a new gear
      return;
    }
    
    // Get the current viewport transform
    const { zoom } = reactFlowInstance.getViewport();
    
    // Get the reactflow container element
    const reactFlowBounds = event.currentTarget.getBoundingClientRect();
    
    // Calculate relative position within the canvas
    const relativeX = event.clientX - reactFlowBounds.left;
    const relativeY = event.clientY - reactFlowBounds.top;
    
    // Calculate the exact position in flow coordinates
    const position = reactFlowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY
    });
    
    // Node dimensions
    const nodeWidth = 160;
    const nodeHeight = 80;
    
    // Add gear at the exact position, centered on cursor
    addGearNode({
      x: position.x - (nodeWidth / 2),
      y: position.y - (nodeHeight / 2)
    });
    
    // If this is the first node, ensure we don't zoom in
    if (nodes.length === 0) {
      // Set a small timeout to let the node be added first
      setTimeout(() => {
        if (reactFlowInstance) {
          reactFlowInstance.setViewport({ x: 0, y: 0, zoom: 1 });
        }
      }, 50);
    }
  }, [reactFlowInstance, addGearNode, nodes.length]);

  // Handle message sent to a gear
  const handleMessageSent = async (message: { role: string; content: string }) => {
    if (!selectedNode) return;
    
    // Find the gear for this node
    const node = nodes.find(n => n.id === selectedNode);
    if (!node?.data?.gearId) return;
    
    const gearId = node.data.gearId;
    
    // Add message to local state
    setGearMessages(prev => [...prev, { ...message, id: crypto.randomUUID() }]);
    
    // Add message to the gear
    try {
      const gear = await Gear.findById(gearId);
      if (gear) {
        await gear.addMessage(message);
      }
    } catch (error) {
      console.error("Error sending message to gear:", error);
    }
  };

  // Save changes to the patch
  const savePatch = useCallback(async () => {
    try {
      setSaving(true);
      const patch = await Patch.findById(patchId);
      
      if (patch) {
        await patch.updateFromReactFlow({ nodes, edges });
      } else {
        // Create a new patch if it doesn't exist
        await Patch.create({
          id: patchId,
          name: patchName,
          nodes,
          edges,
        });
      }
      
      // Update localStorage
      if (typeof window !== 'undefined') {
        const savedPatches = localStorage.getItem('patches');
        const patches = savedPatches ? JSON.parse(savedPatches) : [];
        
        const patchIndex = patches.findIndex((p: {id: string}) => p.id === patchId);
        const updatedPatch = {
          id: patchId,
          name: patchName,
          description: "",
          updatedAt: Date.now(),
          nodeCount: nodes.length,
          nodes,
          edges,
        };
        
        if (patchIndex >= 0) {
          patches[patchIndex] = updatedPatch;
        } else {
          patches.push(updatedPatch);
        }
        
        localStorage.setItem('patches', JSON.stringify(patches));
      }
    } catch (error) {
      console.error("Error saving patch:", error);
    } finally {
      setSaving(false);
    }
  }, [patchId, patchName, nodes, edges]);

  // Initialize the flow once with a consistent zoom level
  useEffect(() => {
    if (reactFlowInstance && nodes.length === 0) {
      // Set a default viewport for empty canvas
      reactFlowInstance.setViewport({ x: 0, y: 0, zoom: 1 });
    }
  }, [reactFlowInstance, nodes.length]);

  return (
    <div className="container mx-auto p-4 flex h-[calc(100vh-3.5rem)]">
      <div className="flex-1 pr-4">
        <Card className="h-full">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{patchName}</CardTitle>
            <div className="flex space-x-2">
              <Button 
                onClick={savePatch}
                disabled={saving}
              >
                Save Patch
              </Button>
            </div>
          </CardHeader>
          <CardContent className="h-[calc(100%-5rem)]">
            <div className="h-full w-full">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                onInit={setReactFlowInstance}
                nodesDraggable={true}
                fitView={false}
                defaultViewport={{ x: 0, y: 0, zoom: 1 }}
              >
                <Controls />
                <MiniMap />
                <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
              </ReactFlow>
            </div>
          </CardContent>
        </Card>
      </div>
      {selectedNode && (
        <div className="w-1/3 border-l pl-4 h-full flex flex-col">
          <div className="mb-4">
            <h3 className="text-lg font-semibold">
              {nodes.find(n => n.id === selectedNode)?.data?.label || "Gear"}
            </h3>
            <p className="text-sm text-gray-500">
              ID: {nodes.find(n => n.id === selectedNode)?.data?.gearId}
            </p>
          </div>
          <div className="flex-grow overflow-hidden">
            <ChatSidebar
              gearId={nodes.find(n => n.id === selectedNode)?.data?.gearId || ""}
              initialMessages={gearMessages}
              onMessageSent={handleMessageSent}
            />
          </div>
        </div>
      )}
    </div>
  );
}
