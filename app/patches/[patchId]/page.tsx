"use client";

import { useParams } from "next/navigation";
import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ChatSidebar } from "@/components/ChatSidebar";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  Panel,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Connection,
  Node,
  Edge,
  BackgroundVariant,
  ReactFlowInstance,
  OnNodesChange,
  OnEdgesChange,
  Position,
  Handle,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Patch, PatchNode, PatchEdge } from "@/lib/models/Patch";
import { Gear } from "@/lib/models/Gear";

// Custom node component for gears
const GearNode = ({ id, data, isConnectable }: { id: string; data: any; isConnectable: boolean }) => {
  return (
    <div 
      className={`rounded-lg bg-white border-2 p-4 w-40 h-20 flex items-center justify-center transition-all duration-300 ${
        data.isProcessing 
          ? "border-blue-500 shadow-md shadow-blue-200 animate-pulse" 
          : "border-gray-200"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
      />
      <div>{data.label}</div>
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
      />
    </div>
  );
};

export default function PatchPage() {
  const params = useParams();
  const patchId = params.patchId as string;
  
  const [patchName, setPatchName] = useState<string>("");
  const [isEditingName, setIsEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [gearMessages, setGearMessages] = useState<{ id?: string; role: string; content: string }[]>([]);
  // Define a type for our node data
  type NodeData = {
    gearId: string;
    label: string;
    isProcessing?: boolean;
  };
  
  const [nodes, setNodes] = useState<Node<NodeData>[]>([]);
  const [exampleInputs, setExampleInputs] = useState<any[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [saving, setSaving] = useState(false);
  const [processingGears, setProcessingGears] = useState<Set<string>>(new Set());
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [dataModified, setDataModified] = useState(false);
  const [saveTimeout, setSaveTimeout] = useState<NodeJS.Timeout | null>(null);
  
  // Track if we're currently connecting nodes
  const [isConnecting, setIsConnecting] = useState(false);
  
  // Track recent edge connections to prevent adding gear when connection completes
  const [recentConnection, setRecentConnection] = useState<{ timestamp: number, source: string, target: string } | null>(null);

  // Handle starting patch name edit
  const startEditingName = () => {
    setIsEditingName(true);
    // Focus the input after state update
    setTimeout(() => nameInputRef.current?.focus(), 0);
  };

  // Handle saving patch name
  const savePatchName = async () => {
    setIsEditingName(false);
    setDataModified(true);

    try {
      // Update localStorage for immediate feedback
      if (typeof window !== 'undefined') {
        const savedPatches = localStorage.getItem('patches');
        if (savedPatches) {
          const patches = JSON.parse(savedPatches);
          const patchIndex = patches.findIndex((p: {id: string}) => p.id === patchId);
          
          if (patchIndex >= 0) {
            patches[patchIndex] = {
              ...patches[patchIndex],
              name: patchName,
              updatedAt: Date.now()
            };
            localStorage.setItem('patches', JSON.stringify(patches));
          }
        }
      }
      
      // Update via API
      const response = await fetch(`/api/patches/${patchId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: patchName
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to update patch name:', errorText);
      }
    } catch (error) {
      console.error('Error updating patch name:', error);
    }
  };

  // Load patch data from API instead of direct KV access
  useEffect(() => {
    async function loadPatch() {
      try {
        // Reset modification flag when loading a new patch
        setDataModified(false);
        
        // Load from API which uses server-side KV
        const response = await fetch(`/api/patches/${patchId}`);
        
        if (response.ok) {
          const patchData = await response.json();
          
          // Set state from patch data
          setPatchName(patchData.name);
          
          // Ensure all nodes use the gearNode type and have isProcessing property
          const updatedNodes = patchData.nodes.map((node: PatchNode) => ({
            ...node,
            type: 'gearNode',
            data: {
              ...node.data,
              isProcessing: false
            }
          }));
          
          setNodes(updatedNodes);
          setEdges(patchData.edges);
        } else if (response.status === 404) {
          // Check for localStorage data for backwards compatibility
          if (typeof window !== 'undefined') {
            const savedPatches = localStorage.getItem('patches');
            if (savedPatches) {
              const patches = JSON.parse(savedPatches);
              const localPatchData = patches.find((p: {id: string}) => p.id === patchId);
              
              if (localPatchData) {
                // Save patch to server via API
                const createResponse = await fetch(`/api/patches/${patchId}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    name: localPatchData.name,
                    description: localPatchData.description || "",
                    nodes: localPatchData.nodes || [],
                    edges: localPatchData.edges || []
                  })
                });
                
                if (createResponse.ok) {
                  // Fetch the newly created patch
                  const newPatchResponse = await fetch(`/api/patches/${patchId}`);
                  if (newPatchResponse.ok) {
                    const newPatchData = await newPatchResponse.json();
                    setPatchName(newPatchData.name);
                    setNodes(newPatchData.nodes);
                    setEdges(newPatchData.edges);
                    return;
                  }
                }
              }
            }
          }
          
          // Default empty patch
          setPatchName(`Patch ${patchId}`);
        }
      } catch (error) {
        console.error("Error loading patch:", error);
        setPatchName(`Patch ${patchId}`);
      }
    }
    
    loadPatch();
  }, [patchId, setNodes, setEdges]);

  // Function to check if connection was just made
  const wasConnectionJustMade = useCallback(() => {
    if (!recentConnection) return false;
    
    // Connection is considered recent if it happened within last 500ms
    const isRecent = Date.now() - recentConnection.timestamp < 500;
    
    // Clean up old connections
    if (!isRecent) {
      setRecentConnection(null);
    }
    
    return isRecent;
  }, [recentConnection]);

  // Handle connecting nodes
  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      
      // Record that a connection was just made to prevent creating a gear
      setRecentConnection({
        timestamp: Date.now(),
        source: connection.source,
        target: connection.target
      });
      
      // Reset isConnecting flag
      setIsConnecting(false);
      
      const newEdge: Edge = {
        ...connection,
        id: `e${connection.source}-${connection.target}`,
      };
      
      // Update edges state
      setEdges((eds) => addEdge(connection, eds));
      
      // Mark data as modified since user added an edge
      setDataModified(true);
      
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
    [setEdges, patchId, nodes, setRecentConnection, setIsConnecting, setDataModified],
  );

  // Handle adding a new gear node at a specific position
  // Define node types
  const nodeTypes = {
    gearNode: GearNode
  };

  const addGearNode = useCallback(async (position = { x: Math.random() * 300, y: Math.random() * 300 }) => {
    try {
      setSaving(true);
      
      // Use UUID for guaranteed uniqueness
      const uniqueId = crypto.randomUUID();
      const gearId = `gear-${uniqueId}`;
      const nodeId = `node-${uniqueId}`;
      
      // Add some initial instructions to the gear
      const initialMessages = [
        {
          role: "system" as const,
          content: "You are a Gear that processes inputs and produces outputs. You can be configured with instructions."
        },
        {
          role: "user" as const,
          content: "How do I use this Gear?"
        },
        {
          role: "assistant" as const,
          content: "You can send me instructions or data, and I'll process them according to my configuration. Add specific instructions about what you want me to do with inputs."
        }
      ];
      
      // Create gear on the server first via API - this is critical
      console.log(`Creating gear ${gearId} on server...`);
      const createResponse = await fetch('/api/gears', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: gearId,
          messages: initialMessages.map(msg => ({
            ...msg,
            role: msg.role as "user" | "assistant" | "system"
          }))
        }),
      });
      
      // Handle potential error cases with more grace
      if (!createResponse.ok) {
        if (createResponse.status === 409) {
          // If gear already exists, that's fine - we'll just use it
          console.log(`Gear ${gearId} already exists on server, continuing...`);
        } else {
          throw new Error(`Failed to create gear on server: ${await createResponse.text()}`);
        }
      } else {
        console.log(`Gear ${gearId} created on server successfully`);
      }
      
      // Verify gear exists on server before proceeding
      const verifyResponse = await fetch(`/api/gears/${gearId}`);
      if (!verifyResponse.ok) {
        console.log(`Warning: Created gear ${gearId} but can't fetch it`);
        // Try once more to create it
        await fetch('/api/gears', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: gearId,
            messages: initialMessages
          }),
        });
      }
      
      // Create local representation only after server confirms creation
      console.log(`Creating local representation of gear ${gearId}`);
      const gear = await Gear.create({
        id: gearId,
        messages: initialMessages.map(msg => ({
          ...msg,
          role: msg.role as "user" | "assistant" | "system"
        })),
      });
      
      // Create a node representation with the same unique ID base
      const newNode: PatchNode = {
        id: nodeId,
        type: 'gearNode',
        position,
        data: {
          gearId: gear.id,
          label: `Gear ${uniqueId.slice(0, 8)}`,
          isProcessing: false
        }
      };
      
      // Add to local state - use a function that doesn't rely on prev state to avoid duplicate adds
      const currentNodeIds = new Set(nodes.map(n => n.id));
      if (!currentNodeIds.has(nodeId)) {
        setNodes(prevNodes => [...prevNodes, newNode]);
        // Mark data as modified since user added a node
        setDataModified(true);
      }
      
      // Save to the patch
      const patch = await Patch.findById(patchId);
      if (patch) {
        // Check if node already exists in patch before adding
        const patchNodeExists = patch.nodes.some(n => n.id === nodeId);
        if (!patchNodeExists) {
          await patch.addNode(newNode);
        }
        // Save the entire patch at this point for immediate consistency
        await patch.save();
      }
    } catch (error) {
      console.error("Error adding gear node:", error);
    } finally {
      setSaving(false);
    }
  }, [patchId, setNodes, setDataModified]);

  // Handle node selection
  const onNodeClick = useCallback(async (_: React.MouseEvent, node: Node) => {
    setSelectedNode(node.id);
    
    // Load messages for this gear
    const gearId = node.data?.gearId;
    if (!gearId) return;
    
    console.log(`Node clicked, loading gear: ${gearId}`);
    
    try {
      // First check on the server
      const serverResponse = await fetch(`/api/gears/${gearId}`);
      let serverGear = null;
      
      if (serverResponse.ok) {
        console.log(`Gear ${gearId} found on server`);
        serverGear = await serverResponse.json();
      } else {
        console.log(`Gear ${gearId} not found on server, status: ${serverResponse.status}`);
        
        // Try to create it on the server
        console.log(`Creating gear ${gearId} on server`);
        const createResponse = await fetch('/api/gears', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: gearId,
            messages: [
              {
                role: "system" as const,
                content: "You are a Gear that processes inputs and produces outputs. You can be configured with instructions."
              }
            ]
          }),
        });
        
        if (createResponse.ok) {
          console.log(`Successfully created gear ${gearId} on server`);
          const verifyResponse = await fetch(`/api/gears/${gearId}`);
          if (verifyResponse.ok) {
            serverGear = await verifyResponse.json();
          }
        } else {
          console.error(`Failed to create gear ${gearId} on server:`, await createResponse.text());
        }
      }
      
      // Check locally
      let gear = await Gear.findById(gearId as string);
      
      if (gear) {
        console.log(`Gear ${gearId} found locally`);
        setGearMessages(gear.messages);
        setExampleInputs(gear.exampleInputs);
        
        // If we also have server data, make sure they're in sync
        if (serverGear) {
          // If server has newer/more messages, update local
          if (serverGear.messages?.length > gear.messages.length) {
            console.log(`Updating local gear ${gearId} with server data (more messages)`);
            await gear.setMessages(serverGear.messages);
            await gear.save();
            setGearMessages(gear.messages);
          }
        }
      } else if (serverGear) {
        // No local gear but we have server data
        console.log(`Creating local gear ${gearId} from server data`);
        gear = await Gear.create({
          id: gearId as string,
          messages: serverGear.messages || [],
          exampleInputs: serverGear.exampleInputs || [],
          outputUrls: serverGear.outputUrls || []
        });
        
        setGearMessages(gear.messages);
        setExampleInputs(gear.exampleInputs);
      } else {
        // No gear found anywhere
        console.log(`No gear ${gearId} found anywhere, creating new`);
        gear = await Gear.create({
          id: gearId as string,
          messages: [
            {
              role: "system" as const,
              content: "You are a Gear that processes inputs and produces outputs. You can be configured with instructions."
            }
          ]
        });
        
        setGearMessages(gear.messages);
        setExampleInputs([]);
      }
    } catch (error) {
      console.error(`Error loading gear ${gearId}:`, error);
      setGearMessages([]);
      setExampleInputs([]);
    }
  }, []);
  
  // Handle canvas click to add a new gear
  const onPaneClick = useCallback((event: React.MouseEvent) => {
    // Don't create a gear if:
    // 1. The reactFlowInstance is not available
    // 2. We're in the middle of making a connection
    // 3. We just completed a connection
    if (!reactFlowInstance) return;
    
    // Check if we're connecting nodes (look for connection elements in the DOM)
    const connectingLine = document.querySelector('.react-flow__connection-path');
    if (connectingLine || isConnecting || wasConnectionJustMade()) {
      // If a connection line is present, we're in the middle of making a connection,
      // or we just completed a connection, so don't create a new gear
      return;
    }
    
    // Get the reactflow container element
    const reactFlowBounds = event.currentTarget.getBoundingClientRect();
    
    // Calculate the exact position in flow coordinates
    const position = reactFlowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY
    });
    
    // Node dimensions (must match the GearNode component dimensions)
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
  }, [reactFlowInstance, addGearNode, nodes.length, isConnecting, wasConnectionJustMade]);

  // Handle message sent to a gear
  const handleMessageSent = useCallback(async (message: { role: string; content: string }) => {
    if (!selectedNode) return;
    
    // Find the gear for this node
    const node = nodes.find(n => n.id === selectedNode);
    if (!node?.data?.gearId) return;
    
    const gearId = node.data.gearId;
    
    // Add message to local state
    setGearMessages(prev => [...prev, { ...message, id: crypto.randomUUID() }]);
    
    // Add message to the gear
    try {
      // Set processing state for this gear
      setProcessingGears(prev => {
        const newSet = new Set(prev);
        newSet.add(gearId);
        return newSet;
      });
      
      // Update the node to show processing animation
      setNodes(nodes => 
        nodes.map(n => {
          if (n.data.gearId === gearId) {
            return {
              ...n,
              data: {
                ...n.data,
                isProcessing: true
              }
            };
          }
          return n;
        })
      );
      
      const gear = await Gear.findById(gearId as string);
      if (gear) {
        await gear.addMessage({
          role: message.role as "user" | "assistant" | "system",
          content: message.content
        });
        
        // After adding a message, the gear will automatically process all examples,
        // so we need to update our local state with the updated examples
        setExampleInputs(gear.exampleInputs);
        
        // If the message was from the assistant, a label may have been generated
        // Update the node's label from the gear
        if (message.role === "assistant") {
          console.log("UI DEBUG: Assistant message detected, checking for updated label");
          
          // Refetch the gear to get the updated label - IMPORTANT: use the API directly to ensure we get fresh data
          console.log(`UI DEBUG: Refetching gear ${gearId} to get updated label directly from API`);
          const freshResponse = await fetch(`/api/gears/${gearId}`);
          
          let updatedGear = null;
          if (freshResponse.ok) {
            updatedGear = await freshResponse.json();
            console.log(`UI DEBUG: Fresh API data for gear:`, updatedGear);
          } else {
            console.log(`UI DEBUG: Failed to get fresh gear data from API, falling back to Gear.findById`);
            updatedGear = await Gear.findById(gearId as string);
          }
          
          console.log(`UI DEBUG: Refetched gear, label = "${updatedGear?.label}"`);
          
          if (updatedGear && updatedGear.label) {
            console.log(`UI DEBUG: Updating node ${selectedNode} label to "${updatedGear.label}"`);
            
            // Update the node's label in the UI
            setNodes(prev => {
              console.log("UI DEBUG: Current nodes before update:", prev);
              
              const newNodes = prev.map(n => {
                if (n.id === selectedNode) {
                  // Update the node's label
                  console.log(`UI DEBUG: Found node ${n.id}, updating label from "${n.data.label}" to "${updatedGear.label}"`);
                  return {
                    ...n,
                    data: {
                      ...n.data,
                      label: updatedGear.label
                    }
                  };
                }
                return n;
              });
              
              console.log("UI DEBUG: Nodes after update:", newNodes);
              return newNodes;
            });
            
            // Mark data as modified to trigger a save
            console.log("UI DEBUG: Setting dataModified = true");
            setDataModified(true);
          } else {
            console.log(`UI DEBUG: No valid label found on refetched gear:`, updatedGear);
          }
        }
      }
    } catch (error) {
      console.error("Error sending message to gear:", error);
    } finally {
      // Clear processing state
      setProcessingGears(prev => {
        const newSet = new Set(prev);
        newSet.delete(gearId);
        return newSet;
      });
      
      // Update the node to remove processing animation
      setNodes(nodes => 
        nodes.map(n => {
          if (n.data.gearId === gearId) {
            return {
              ...n,
              data: {
                ...n.data,
                isProcessing: false
              }
            };
          }
          return n;
        })
      );
    }
  }, [selectedNode, nodes]);

  // Example input handlers
  const handleAddExample = async (name: string, inputData: string) => {
    if (!selectedNode) return;
    
    const node = nodes.find(n => n.id === selectedNode);
    if (!node?.data?.gearId) return;
    
    const gearId = node.data.gearId;
    
    try {
      // Set processing state for this gear
      setProcessingGears(prev => {
        const newSet = new Set(prev);
        newSet.add(gearId);
        return newSet;
      });
      
      // Update the node to show processing animation
      setNodes(nodes => 
        nodes.map(n => {
          if (n.data.gearId === gearId) {
            return {
              ...n,
              data: {
                ...n.data,
                isProcessing: true
              }
            };
          }
          return n;
        })
      );
      
      const gear = await Gear.findById(gearId);
      if (gear) {
        // Try to parse as JSON if possible
        let parsedInput;
        try {
          parsedInput = JSON.parse(inputData);
        } catch {
          // If it's not valid JSON, use it as is
          parsedInput = inputData;
        }
        
        const example = await gear.addExampleInput(name, parsedInput);
        await gear.processExampleInput(example.id);
        
        // Update local state
        setExampleInputs(gear.exampleInputs);
      }
    } catch (error) {
      console.error("Error adding example input:", error);
    } finally {
      // Clear processing state
      setProcessingGears(prev => {
        const newSet = new Set(prev);
        newSet.delete(gearId);
        return newSet;
      });
      
      // Update the node to remove processing animation
      setNodes(nodes => 
        nodes.map(n => {
          if (n.data.gearId === gearId) {
            return {
              ...n,
              data: {
                ...n.data,
                isProcessing: false
              }
            };
          }
          return n;
        })
      );
    }
  };
  
  const handleUpdateExample = async (id: string, name: string, inputData: string) => {
    if (!selectedNode) return;
    
    const node = nodes.find(n => n.id === selectedNode);
    if (!node?.data?.gearId) return;
    
    const gearId = node.data.gearId;
    
    try {
      // Set processing state for this gear
      setProcessingGears(prev => {
        const newSet = new Set(prev);
        newSet.add(gearId);
        return newSet;
      });
      
      // Update the node to show processing animation
      setNodes(nodes => 
        nodes.map(n => {
          if (n.data.gearId === gearId) {
            return {
              ...n,
              data: {
                ...n.data,
                isProcessing: true
              }
            };
          }
          return n;
        })
      );
      
      const gear = await Gear.findById(gearId);
      if (gear) {
        // Try to parse as JSON if possible
        let parsedInput;
        try {
          parsedInput = JSON.parse(inputData);
        } catch {
          // If it's not valid JSON, use it as is
          parsedInput = inputData;
        }
        
        await gear.updateExampleInput(id, { name, input: parsedInput });
        await gear.processExampleInput(id);
        
        // Update local state
        setExampleInputs(gear.exampleInputs);
      }
    } catch (error) {
      console.error("Error updating example input:", error);
    } finally {
      // Clear processing state
      setProcessingGears(prev => {
        const newSet = new Set(prev);
        newSet.delete(gearId);
        return newSet;
      });
      
      // Update the node to remove processing animation
      setNodes(nodes => 
        nodes.map(n => {
          if (n.data.gearId === gearId) {
            return {
              ...n,
              data: {
                ...n.data,
                isProcessing: false
              }
            };
          }
          return n;
        })
      );
    }
  };
  
  const handleDeleteExample = async (id: string) => {
    if (!selectedNode) return;
    
    const node = nodes.find(n => n.id === selectedNode);
    if (!node?.data?.gearId) return;
    
    const gearId = node.data.gearId;
    
    try {
      const gear = await Gear.findById(gearId);
      if (gear) {
        await gear.deleteExampleInput(id);
        
        // Update local state
        setExampleInputs(gear.exampleInputs);
      }
    } catch (error) {
      console.error("Error deleting example input:", error);
    }
  };
  
  const handleProcessExample = async (id: string) => {
    if (!selectedNode) return;
    
    const node = nodes.find(n => n.id === selectedNode);
    if (!node?.data?.gearId) return;
    
    const gearId = node.data.gearId;
    
    try {
      // Set processing state for this gear
      setProcessingGears(prev => {
        const newSet = new Set(prev);
        newSet.add(gearId);
        return newSet;
      });
      
      // Update the node to show processing animation
      setNodes(nodes => 
        nodes.map(n => {
          if (n.data.gearId === gearId) {
            return {
              ...n,
              data: {
                ...n.data,
                isProcessing: true
              }
            };
          }
          return n;
        })
      );
      
      const gear = await Gear.findById(gearId);
      if (gear) {
        await gear.processExampleInput(id);
        
        // Update local state
        setExampleInputs(gear.exampleInputs);
      }
    } catch (error) {
      console.error("Error processing example input:", error);
    } finally {
      // Clear processing state
      setProcessingGears(prev => {
        const newSet = new Set(prev);
        newSet.delete(gearId);
        return newSet;
      });
      
      // Update the node to remove processing animation
      setNodes(nodes => 
        nodes.map(n => {
          if (n.data.gearId === gearId) {
            return {
              ...n,
              data: {
                ...n.data,
                isProcessing: false
              }
            };
          }
          return n;
        })
      );
    }
  };
  
  const handleProcessAllExamples = async () => {
    if (!selectedNode) return;
    
    const node = nodes.find(n => n.id === selectedNode);
    if (!node?.data?.gearId) return;
    
    const gearId = node.data.gearId;
    
    try {
      // Set processing state for this gear
      setProcessingGears(prev => {
        const newSet = new Set(prev);
        newSet.add(gearId);
        return newSet;
      });
      
      // Update the node to show processing animation
      setNodes(nodes => 
        nodes.map(n => {
          if (n.data.gearId === gearId) {
            return {
              ...n,
              data: {
                ...n.data,
                isProcessing: true
              }
            };
          }
          return n;
        })
      );
      
      const gear = await Gear.findById(gearId);
      if (gear) {
        await gear.processAllExamples();
        
        // Update local state
        setExampleInputs(gear.exampleInputs);
      }
    } catch (error) {
      console.error("Error processing all example inputs:", error);
    } finally {
      // Clear processing state
      setProcessingGears(prev => {
        const newSet = new Set(prev);
        newSet.delete(gearId);
        return newSet;
      });
      
      // Update the node to remove processing animation
      setNodes(nodes => 
        nodes.map(n => {
          if (n.data.gearId === gearId) {
            return {
              ...n,
              data: {
                ...n.data,
                isProcessing: false
              }
            };
          }
          return n;
        })
      );
    }
  };

  // Debug function to check gear status
  const debugGear = async (gearId: string) => {
    if (!gearId) return;
    
    console.log("================= GEAR DEBUG =================");
    console.log(`Checking status of gear: ${gearId}`);
    
    // Try to get the gear from the model
    try {
      const gear = await Gear.findById(gearId);
      if (gear) {
        console.log("✅ Gear found in client model");
        console.log(`- Messages: ${gear.messages.length}`);
        console.log(`- Example inputs: ${gear.exampleInputs.length}`);
      } else {
        console.log("❌ Gear NOT found in client model");
      }
    } catch (error) {
      console.error("Error checking gear in model:", error);
    }
    
    // Check API directly
    try {
      const response = await fetch(`/api/gears/${gearId}`);
      if (response.ok) {
        const data = await response.json();
        console.log("✅ Gear found in API");
        console.log(`- Messages: ${data.messages?.length || 0}`);
        console.log(`- Example inputs: ${data.exampleInputs?.length || 0}`);
      } else {
        console.log(`❌ Gear NOT found in API: ${response.status}`);
      }
    } catch (error) {
      console.error("Error checking gear in API:", error);
    }
    
    // Check chat API
    try {
      const chatResponse = await fetch(`/api/gears/${gearId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: [{ role: 'user', content: 'Debug test message' }] 
        })
      });
      
      if (chatResponse.ok) {
        console.log("✅ Chat API working for this gear");
      } else {
        console.log(`❌ Chat API NOT working: ${chatResponse.status}`);
        const text = await chatResponse.text();
        console.log(`Error: ${text}`);
      }
    } catch (error) {
      console.error("Error checking chat API:", error);
    }
    
    console.log("==============================================");
  };


  // Initialize the flow once with a consistent zoom level
  useEffect(() => {
    if (reactFlowInstance && nodes.length === 0) {
      // Set a default viewport for empty canvas
      reactFlowInstance.setViewport({ x: 0, y: 0, zoom: 1 });
    }
  }, [reactFlowInstance, nodes.length]);
  
  // Effect to handle debounced saving
  useEffect(() => {
    // Don't save on initial empty state
    if (nodes.length === 0 && edges.length === 0) return;
    
    // Only schedule save if we've actually loaded data AND data has been modified
    if (patchName && dataModified) {
      console.log("Scheduling debounced save in 2 seconds");
      
      // Create a new timeout that will run after 2 seconds of inactivity
      const timeoutId = setTimeout(async () => {
        console.log("Executing debounced save - no changes for 2 seconds");
        
        try {
          setSaving(true);
          
          // Save via API
          const response = await fetch(`/api/patches/${patchId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: patchName,
              description: "",
              nodes,
              edges,
            })
          });
          
          if (!response.ok) {
            throw new Error(`Failed to save patch: ${response.status}`);
          }
          
          // Also update localStorage for backward compatibility
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
          
          // Reset the dataModified flag after successful save
          setDataModified(false);
        } catch (error) {
          console.error("Error saving patch:", error);
        } finally {
          setSaving(false);
        }
      }, 2000); // 2 second debounce delay
      
      // Clean up any existing timeout before setting a new one
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
      
      setSaveTimeout(timeoutId);
      
      // Cleanup function to clear timeout if component unmounts or dependencies change
      return () => {
        clearTimeout(timeoutId);
      };
    }
  // Removing saveTimeout from dependency array to prevent infinite loops
  }, [nodes, edges, patchName, patchId, dataModified]);
  
  // Handler for when connection interaction starts
  const onConnectStart = useCallback(() => {
    setIsConnecting(true);
  }, [setIsConnecting]);
  
  // Handler for when connection interaction is canceled/aborted
  const onConnectEnd = useCallback(() => {
    // Use a small delay to ensure we don't reset too early
    setTimeout(() => {
      setIsConnecting(false);
    }, 100);
  }, [setIsConnecting]);

  // Handle nodes changes (add, remove, position, etc)
  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      // Apply changes to nodes with proper typing
      setNodes((nds) => applyNodeChanges(changes, nds) as Node<NodeData>[]);
      
      // Mark data as modified when user makes changes (except when just selected)
      if (changes.some(change => change.type !== 'select')) {
        setDataModified(true);
      }
      
      // Check for node deletion
      const nodeDeletions = changes.filter(change => change.type === 'remove');
      
      // Process node deletions to update server state
      nodeDeletions.forEach(async (deletion) => {
        const nodeId = deletion.id;
        try {
          // Save to server
          const patch = await Patch.findById(patchId);
          if (patch) {
            await patch.removeNode(nodeId);
          }
        } catch (error) {
          console.error(`Error removing node ${nodeId}:`, error);
        }
      });
      
      // If a node was deleted, and it was the selected node, deselect it
      if (selectedNode && nodeDeletions.some(deletion => deletion.id === selectedNode)) {
        setSelectedNode(null);
      }
    },
    [selectedNode, patchId, setDataModified]
  );
  
  // Handle edge changes
  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      setEdges((eds) => applyEdgeChanges(changes, eds) as Edge[]);
      
      // Mark data as modified if edges are added or removed
      if (changes.some(change => change.type === 'remove')) {
        setDataModified(true);
      }
    },
    [setDataModified]
  );
  
  // Function to save patch immediately when called directly
  const savePatch = useCallback(async () => {
    // Clear any existing timeout
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      setSaveTimeout(null);
    }
    
    console.log("Executing immediate save");
    
    try {
      setSaving(true);
      
      // Save via API
      const response = await fetch(`/api/patches/${patchId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: patchName,
          description: "",
          nodes,
          edges,
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to save patch: ${response.status}`);
      }
      
      // Also update localStorage for backward compatibility
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
      
      // Reset the dataModified flag after successful save
      setDataModified(false);
    } catch (error) {
      console.error("Error saving patch:", error);
    } finally {
      setSaving(false);
    }
  // Removing saveTimeout and setSaveTimeout from dependency array to prevent infinite loops
  }, [nodes, edges, patchName, patchId]);

  return (
    <div className="container mx-auto p-4 flex h-[calc(100vh-3.5rem)]">
      <div className="flex-1 pr-4">
        <Card className="h-full">
          <CardHeader className="flex flex-row items-center justify-between">
            {isEditingName ? (
              <div className="w-full max-w-xs">
                <Input
                  ref={nameInputRef}
                  value={patchName}
                  onChange={(e) => setPatchName(e.target.value)}
                  onBlur={savePatchName}
                  onKeyDown={(e) => e.key === 'Enter' && savePatchName()}
                  className="font-semibold text-xl"
                  autoFocus
                />
              </div>
            ) : (
              <CardTitle 
                onClick={startEditingName}
                className="cursor-text hover:bg-gray-50 px-2 py-1 rounded transition-colors"
              >
                {patchName}
              </CardTitle>
            )}
          </CardHeader>
          <CardContent className="h-[calc(100%-5rem)]">
            <div className="h-full w-full">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onConnectStart={onConnectStart}
                onConnectEnd={onConnectEnd}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                onInit={setReactFlowInstance}
                nodesDraggable={true}
                fitView={false}
                defaultViewport={{ x: 0, y: 0, zoom: 1 }}
                proOptions={{ hideAttribution: true }}
              >
                <Controls />
                <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
              </ReactFlow>
            </div>
          </CardContent>
        </Card>
      </div>
      {selectedNode && (
        <div className="w-1/3 border-l pl-4 h-full flex flex-col max-h-full overflow-hidden">
          <div className="mb-2 py-2 flex justify-between items-start">
            <div>
              <h3 className="text-lg font-semibold truncate max-w-full" title={nodes.find(n => n.id === selectedNode)?.data?.label || "Gear"}>
                {nodes.find(n => n.id === selectedNode)?.data?.label || "Gear"}
              </h3>
              <p className="text-xs text-gray-500 truncate">
                ID: {nodes.find(n => n.id === selectedNode)?.data?.gearId}
              </p>
            </div>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setSelectedNode(null)}
              className="h-8 w-8 p-0 mt-1"
            >
              <span className="sr-only">Close</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </Button>
          </div>
          <div className="flex-grow overflow-hidden h-[calc(100%-3rem)]">
            <ChatSidebar
              gearId={nodes.find(n => n.id === selectedNode)?.data?.gearId || ""}
              initialMessages={gearMessages}
              onMessageSent={handleMessageSent}
              exampleInputs={exampleInputs}
              onAddExample={handleAddExample}
              onUpdateExample={handleUpdateExample}
              onDeleteExample={handleDeleteExample}
              onProcessExample={handleProcessExample}
              onProcessAllExamples={handleProcessAllExamples}
            />
          </div>
        </div>
      )}
    </div>
  );
}