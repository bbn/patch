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
import { Gear, GearLogEntry } from "@/lib/models/Gear";
import { onSnapshot, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Custom node component for gears
const GearNode = ({ id, data, isConnectable }: { id: string; data: any; isConnectable: boolean }) => {
  const [gearLabel, setGearLabel] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  
  // Use React Flow's default handle IDs (null)
  
  // Subscribe to real-time updates from Firestore for this gear
  useEffect(() => {
    if (!data.gearId) return;
    
    console.log(`GearNode: Setting up subscription for ${data.gearId}`);
    
    // Always get the label from Firebase
    const unsubscribe = onSnapshot(
      doc(db, 'gears', data.gearId), 
      (docSnap) => {
        if (docSnap.exists()) {
          const gearData = docSnap.data();
          
          // Get label from Firestore
          const firestoreLabel = gearData.label || `Gear ${data.gearId.slice(0, 8)}`;
          
          // Update label if changed
          if (firestoreLabel !== gearLabel) {
            console.log(`GearNode: Updated label for ${data.gearId} to "${firestoreLabel}"`);
            setGearLabel(firestoreLabel);
          }
          
          // Update processing state from Firebase
          const newProcessingState = Boolean(gearData.isProcessing);
          if (newProcessingState !== isProcessing) {
            console.log(`GearNode: Updated processing state for ${data.gearId} to ${newProcessingState}`);
            setIsProcessing(newProcessingState);
          }
        }
      },
      (error) => {
        console.error(`Error in GearNode Firestore updates for ${data.gearId}:`, error);
      }
    );
    
    // Clean up subscription on unmount
    return () => unsubscribe();
  }, [data.gearId, gearLabel, isProcessing]);
  
  // Show a loading indicator until we get the label from Firestore
  if (!gearLabel) {
    return (
      <div className="rounded-lg bg-white border-2 p-4 w-40 h-20 flex items-center justify-center">
        <div className="animate-pulse">Loading...</div>
        {/* Include handles even when loading to ensure React Flow can render connections */}
        <Handle
          type="target"
          position={Position.Top}
          isConnectable={isConnectable}
        />
        <Handle
          type="source"
          position={Position.Bottom}
          isConnectable={isConnectable}
        />
      </div>
    );
  }
  
  // Truncate label if it's too long to fit in the node
  const displayLabel = gearLabel.length > 25 
    ? gearLabel.substring(0, 22) + '...' 
    : gearLabel;
  
  return (
    <div 
      className={`rounded-lg bg-white border-2 p-4 w-40 h-20 flex items-center justify-center transition-all duration-300 ${
        isProcessing 
          ? "border-blue-500 shadow-md shadow-blue-200 animate-pulse" 
          : "border-gray-200"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
      />
      <div className="text-center text-sm truncate max-w-[140px]" title={gearLabel}>
        {displayLabel}
      </div>
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
  const [patchDescription, setPatchDescription] = useState<string>("");
  const [isEditingName, setIsEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [gearMessages, setGearMessages] = useState<{ id?: string; role: string; content: string }[]>([]);
  const [logEntries, setLogEntries] = useState<GearLogEntry[]>([]);
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
  const [isLoading, setIsLoading] = useState(true);
  const [processingGears, setProcessingGears] = useState<Set<string>>(new Set());
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [dataModified, setDataModified] = useState(false);
  const [saveTimeout, setSaveTimeout] = useState<NodeJS.Timeout | null>(null);
  const [currentPatch, setCurrentPatch] = useState<Patch | null>(null);
  const [unsubscribePatch, setUnsubscribePatch] = useState<(() => void) | null>(null);
  const [selectedGear, setSelectedGear] = useState<Gear | null>(null);
  const [unsubscribeGear, setUnsubscribeGear] = useState<(() => void) | null>(null);
  
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
      // Attempt to save through the Patch model
      if (currentPatch) {
        currentPatch.name = patchName;
        await currentPatch.save();
      } else {
        // Update via API if no current patch
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
      }

      // Data is saved via model or API
    } catch (error) {
      console.error('Error updating patch name:', error);
    }
  };

  // Load patch data and subscribe to real-time updates
  useEffect(() => {
    async function loadPatch() {
      setIsLoading(true);
      try {
        // Reset modification flag when loading a new patch
        setDataModified(false);
        
        // Attempt to load patch from the server
        const loadedPatch = await Patch.findById(patchId);
        
        if (loadedPatch) {
          // Set current patch reference for direct model operations
          setCurrentPatch(loadedPatch);
          
          // Set state from patch data
          setPatchName(loadedPatch.name);
          setPatchDescription(loadedPatch.description || "");
          
          // Ensure all nodes use the gearNode type and have isProcessing property
          // We need to ensure the label is preserved for TypeScript
          const updatedNodes = loadedPatch.nodes.map((node: PatchNode) => {
            return {
              ...node,
              type: 'gearNode',
              data: {
                gearId: node.data.gearId,
                label: node.data.label || `Gear ${node.data.gearId?.slice(0, 8)}`, 
                isProcessing: false
              }
            };
          });
          
          // Process edges - remove any handle IDs that might be causing issues
          const updatedEdges = loadedPatch.edges.map(({ sourceHandle, targetHandle, ...edge }) => ({
            ...edge,
            type: 'default'  // Explicitly set type to default for all edges
            // Deliberately omit sourceHandle and targetHandle to use ReactFlow defaults
          }));
          
          console.log('Loaded edges:', updatedEdges);
          
          setNodes(updatedNodes);
          console.log('Setting edges in loadPatch:', updatedEdges);
          setEdges(updatedEdges);
          
          // Subscribe to real-time updates for this patch
          const unsubscribe = loadedPatch.subscribeToUpdates((updatedPatch) => {
            setPatchName(updatedPatch.name);
            setPatchDescription(updatedPatch.description || "");
            
            // Ensure all nodes use the gearNode type and have isProcessing property
            // We need to ensure the label is preserved for TypeScript
            const updatedNodes = updatedPatch.nodes.map((node: PatchNode) => {
              return {
                ...node,
                type: 'gearNode',
                data: {
                  gearId: node.data.gearId,
                  label: node.data.label || `Gear ${node.data.gearId?.slice(0, 8)}`, 
                  isProcessing: false
                }
              };
            });
            
            // Process edges - remove any handle IDs that might be causing issues
            const updatedEdges = updatedPatch.edges.map(({ sourceHandle, targetHandle, ...edge }) => ({
              ...edge,
              type: 'default'  // Explicitly set type to default for all edges
              // Deliberately omit sourceHandle and targetHandle to use ReactFlow defaults
            }));
            
            console.log('Subscription updated edges:', updatedEdges);
            
            setNodes(updatedNodes);
            setEdges(updatedEdges);
          });
          
          setUnsubscribePatch(() => unsubscribe);
        } else {
          // Patch not found, create a new one
          // Default empty patch if not found
          setPatchName(`Patch ${patchId}`);
          const newPatch = await Patch.create({
            id: patchId,
            name: `Patch ${patchId}`
          });
          
          setCurrentPatch(newPatch);
          
          // Subscribe to real-time updates
          const unsubscribe = newPatch.subscribeToUpdates((updatedPatch) => {
            setPatchName(updatedPatch.name);
            setPatchDescription(updatedPatch.description || "");
            
            // Ensure all nodes use the gearNode type
            // We need to ensure the label is preserved for TypeScript
            const updatedNodes = updatedPatch.nodes.map((node: PatchNode) => {
              return {
                ...node,
                type: 'gearNode',
                data: {
                  gearId: node.data.gearId,
                  label: node.data.label || `Gear ${node.data.gearId?.slice(0, 8)}`, 
                  isProcessing: false
                }
              };
            });
            
            // Process edges - remove any handle IDs that might be causing issues
            const updatedEdges = updatedPatch.edges.map(({ sourceHandle, targetHandle, ...edge }) => ({
              ...edge,
              type: 'default'  // Explicitly set type to default for all edges
              // Deliberately omit sourceHandle and targetHandle to use ReactFlow defaults
            }));
            
            console.log('New patch updated edges:', updatedEdges);
            
            setNodes(updatedNodes);
            setEdges(updatedEdges);
          });
          
          setUnsubscribePatch(() => unsubscribe);
        }
      } catch (error) {
        console.error("Error loading patch:", error);
        setPatchName(`Patch ${patchId}`);
      } finally {
        setIsLoading(false);
      }
    }
    
    loadPatch();
    
    // Cleanup subscriptions when component unmounts or patchId changes
    return () => {
      if (unsubscribePatch) {
        unsubscribePatch();
        setUnsubscribePatch(null);
      }
      if (unsubscribeGear) {
        unsubscribeGear();
        setUnsubscribeGear(null);
      }
    };
  }, [patchId]);

  // Function to check if connection was just made
  const wasConnectionJustMade = useCallback(() => {
    if (!recentConnection) return false;
    
    // Connection is considered recent if it happened within last 500ms
    const isRecent = Date.now() - recentConnection.timestamp < 500;
    
    // Clean up old connections, but avoid state updates during rendering
    if (!isRecent) {
      // Use setTimeout to avoid causing a new render cycle during this check
      setTimeout(() => {
        setRecentConnection(null);
      }, 0);
    }
    
    return isRecent;
  }, [recentConnection]);

  // Handle connecting nodes
  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      
      try {
        // Record that a connection was just made to prevent creating a gear
        setRecentConnection({
          timestamp: Date.now(),
          source: connection.source,
          target: connection.target
        });
        
        // Create unique edge ID
        const edgeId = `e${connection.source}-${connection.target}`;
        
        // Create new edge with a proper ID and explicit type
        // Extract connection properties without handles
        const { sourceHandle, targetHandle, ...connectionWithoutHandles } = connection;
        
        // Create edge with just the necessary properties
        const newEdge: Edge = {
          ...connectionWithoutHandles,
          id: edgeId,
          type: 'default' // Explicitly set the type to default
        };
        
        // Safely update edges state - this is where the error might be happening
        setEdges(prevEdges => {
          try {
            // Log the edges and nodes to verify state
            console.log('Previous edges:', prevEdges);
            console.log('Current nodes:', nodes);

            // Create a connection with explicit type
            // Use the connection's sourceHandle and targetHandle as is
            // Don't add default values - let ReactFlow handle this
            const typedConnection = {
              ...connection,
              type: 'default'
            };
            
            // Use the typed connection with addEdge
            const newEdges = addEdge(typedConnection, prevEdges) as Edge[];
            
            // Ensure all edges have the type property and remove handle IDs
            const processedEdges = newEdges.map(({ sourceHandle, targetHandle, ...edge }) => ({
              ...edge,
              type: 'default'
            }));
            
            console.log('New edges after adding:', processedEdges);
            return processedEdges;
          } catch (e) {
            console.error("Error adding edge:", e);
            // Return unchanged edges if there's an error
            return prevEdges;
          }
        });
        
        // Mark data as modified since user added an edge
        setDataModified(true);
        
        // Use the current patch instance or fetch a new one
        const patch = currentPatch || await Patch.findById(patchId);
        if (patch) {
          const sourceNode = nodes.find(n => n.id === connection.source);
          const targetNode = nodes.find(n => n.id === connection.target);
          
          if (sourceNode && targetNode) {
            // Create a patch edge without handle IDs to avoid reactflow errors
            const patchEdge: PatchEdge = {
              id: edgeId,
              source: sourceNode.id,
              target: targetNode.id
              // Omit sourceHandle and targetHandle entirely
            };
            
            await patch.addEdge(patchEdge);
          }
        }
      } catch (error) {
        console.error("Error saving edge:", error);
      } finally {
        // Reset isConnecting flag in finally block to ensure it's always reset
        setIsConnecting(false);
      }
    },
    [setEdges, patchId, nodes, setRecentConnection, setIsConnecting, setDataModified, currentPatch],
  );

  // Handle adding a new gear node at a specific position
  // Define node types
  const nodeTypes = {
    gearNode: GearNode
  };
  
  // Define edge types to ensure proper rendering
  const edgeTypes = {};

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
      // Include the required label in the node data to satisfy TypeScript
      const newNode: PatchNode = {
        id: nodeId,
        type: 'gearNode',
        position,
        data: {
          gearId: gear.id,
          label: gear.label,
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
      if (currentPatch) {
        // Use the current patch instance for consistency
        const patchNodeExists = currentPatch.nodes.some(n => n.id === nodeId);
        if (!patchNodeExists) {
          await currentPatch.addNode(newNode);
        }
        // Save the entire patch for immediate consistency
        await currentPatch.save();
      } else {
        // Fall back to finding the patch again if currentPatch is missing
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
      }
    } catch (error) {
      console.error("Error adding gear node:", error);
    } finally {
      setSaving(false);
    }
  }, [patchId, nodes, setNodes, setDataModified, currentPatch]);

  // Handle node selection and load gear data with real-time updates
  const onNodeClick = useCallback(async (_: React.MouseEvent, node: Node) => {
    // Prevent duplicate clicks
    if (selectedNode === node.id) {
      console.log(`Node ${node.id} already selected, ignoring click`);
      return;
    }
    
    // Store the current node data to maintain the label
    const currentNodeData = node.data;
    console.log(`Node clicked with data:`, currentNodeData);
    
    // Clear previous state to avoid stale data displaying
    setGearMessages([]);
    setExampleInputs([]);
    setLogEntries([]);
    setSelectedGear(null);
    
    // Set the selected node
    console.log(`Setting selected node to ${node.id}`);
    setSelectedNode(node.id);
    
    // Unsubscribe from any previous gear subscription
    if (unsubscribeGear) {
      console.log(`Unsubscribing from previous gear`);
      unsubscribeGear();
      setUnsubscribeGear(null);
    }
    
    // Load messages for this gear
    const gearId = node.data?.gearId;
    if (!gearId) {
      console.error(`No gearId found in node data for node ${node.id}`);
      return;
    }
    
    console.log(`Node clicked, loading gear: ${gearId}`);
    
    try {
      // First check if gear exists on the server
      const serverResponse = await fetch(`/api/gears/${gearId}`);
      let serverGear = null;
      
      if (serverResponse.ok) {
        console.log(`Gear ${gearId} found on server`);
        serverGear = await serverResponse.json();
        
        // Log the label found on the server
        console.log(`Server returned label: "${serverGear.label}" for gear ${gearId}`);
        
        // Preserve the label from the node if the server returns a generic label
        const gearIdPrefix = typeof gearId === 'string' ? gearId.slice(0, 8) : '';
        const serverLabel = typeof serverGear.label === 'string' ? serverGear.label : '';
        const nodeLabel = currentNodeData && typeof currentNodeData.label === 'string' ? currentNodeData.label : '';
        
        if (serverLabel && serverLabel.startsWith(`Gear ${gearIdPrefix}`) && 
            nodeLabel && !nodeLabel.startsWith(`Gear ${gearIdPrefix}`)) {
          console.log(`Server label appears generic, preserving node label: "${nodeLabel}"`);
          serverGear.label = nodeLabel;
        }
      } else {
        console.log(`Gear ${gearId} not found on server, status: ${serverResponse.status}`);
        
        // Check again with the 'no-cache' option
        console.log(`Retrying gear ${gearId} with no-cache`);
        const retryResponse = await fetch(`/api/gears/${gearId}`, {
          cache: 'no-store',
          headers: { 'Pragma': 'no-cache' }
        });
        
        if (retryResponse.ok) {
          console.log(`Second attempt: Gear ${gearId} found on server`);
          serverGear = await retryResponse.json();
        } else {
          // Only try to create if second check also fails
          console.log(`Creating gear ${gearId} on server`);
          try {
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
              // Handle the 409 conflict specifically
              if (createResponse.status === 409) {
                console.log(`Gear ${gearId} already exists, fetching it instead`);
                const existingResponse = await fetch(`/api/gears/${gearId}`);
                if (existingResponse.ok) {
                  serverGear = await existingResponse.json();
                }
              } else {
                console.warn(`Failed to create gear ${gearId} on server:`, await createResponse.text());
              }
            }
          } catch (createError) {
            console.warn(`Error while creating/fetching gear ${gearId}:`, createError);
          }
        }
      }
      
      // Find or create the gear locally
      let gear = await Gear.findById(gearId as string);
      
      if (gear) {
        console.log(`Gear ${gearId} found locally`);
        
        // Preserve the current node label if it's meaningful (not a generic one)
        const nodeLabel = currentNodeData && typeof currentNodeData.label === 'string' ? currentNodeData.label : '';
        const gearIdPrefix = typeof gearId === 'string' ? gearId.slice(0, 8) : '';
        const gearLabel = typeof gear.label === 'string' ? gear.label : '';
        
        if (nodeLabel && !nodeLabel.startsWith(`Gear ${gearIdPrefix}`)) {
          console.log(`Local gear has label "${gearLabel}", node has label "${nodeLabel}"`);
          
          // If the local gear has a generic label but the node has a custom one, update the gear
          if (gearLabel.startsWith(`Gear ${gearIdPrefix}`)) {
            console.log(`Setting local gear label to node label: "${nodeLabel}"`);
            await gear.setLabel(nodeLabel);
          }
        }
        
        setSelectedGear(gear);
        setGearMessages(gear.messages);
        setExampleInputs(gear.exampleInputs);
        setLogEntries(gear.log || []);
        
        // If we also have server data, make sure they're in sync
        if (serverGear) {
          // If server has newer/more messages, update local
          if (serverGear.messages?.length > gear.messages.length) {
            console.log(`Updating local gear ${gearId} with server data (more messages)`);
            await gear.setMessages(serverGear.messages);
            await gear.save();
            setGearMessages(gear.messages);
          }
          
          // Get log entries from server if available
          if (serverGear.log) {
            setLogEntries(serverGear.log);
          }
          
          // Update server if we have a better label
          const gearIdPrefix = typeof gearId === 'string' ? gearId.slice(0, 8) : '';
          const gearLabel = typeof gear.label === 'string' ? gear.label : '';
          const serverLabel = serverGear.label && typeof serverGear.label === 'string' ? serverGear.label : '';
          
          if (gearLabel && !gearLabel.startsWith(`Gear ${gearIdPrefix}`) && 
              serverLabel && serverLabel.startsWith(`Gear ${gearIdPrefix}`)) {
            console.log(`Updating server with better label: "${gearLabel}"`);
            
            try {
              const updateResponse = await fetch(`/api/gears/${gearId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label: gearLabel })
              });
              
              if (updateResponse.ok) {
                console.log(`Successfully updated server label to "${gearLabel}"`);
              }
            } catch (error) {
              console.warn(`Failed to update server label: ${error}`);
            }
          }
        }
        
        // Subscribe to real-time updates for this gear
        const unsubscribe = gear.subscribeToUpdates((updatedGear) => {
          setSelectedGear(updatedGear);
          setGearMessages(updatedGear.messages);
          setExampleInputs(updatedGear.exampleInputs);
          setLogEntries(updatedGear.log || []);
          
          // We no longer need to update labels in UI and patch - GearNode does that
          // Just log updated gear for debugging
          console.log(`Subscription update: received updated gear with label="${updatedGear.label}"`);
        });
        
        setUnsubscribeGear(() => unsubscribe);
      } else if (serverGear) {
        // No local gear but we have server data
        console.log(`Creating local gear ${gearId} from server data`);
        
        // Check if we should use the node's label instead of server's generic label
        const nodeLabel = currentNodeData && typeof currentNodeData.label === 'string' ? currentNodeData.label : '';
        const gearIdPrefix = typeof gearId === 'string' ? gearId.slice(0, 8) : '';
        const serverLabel = serverGear.label && typeof serverGear.label === 'string' ? serverGear.label : '';
        
        if (nodeLabel && !nodeLabel.startsWith(`Gear ${gearIdPrefix}`) &&
            serverLabel && serverLabel.startsWith(`Gear ${gearIdPrefix}`)) {
          console.log(`Using node's label "${nodeLabel}" instead of server's generic label`);
          serverGear.label = nodeLabel;
        }
        
        gear = await Gear.create({
          id: gearId as string,
          messages: serverGear.messages || [],
          exampleInputs: serverGear.exampleInputs || [],
          outputUrls: serverGear.outputUrls || [],
          log: serverGear.log || [],
          label: serverGear.label
        });
        
        setSelectedGear(gear);
        setGearMessages(gear.messages);
        setExampleInputs(gear.exampleInputs);
        setLogEntries(gear.log || []);
        
        // Subscribe to real-time updates
        const unsubscribe = gear.subscribeToUpdates((updatedGear) => {
          setSelectedGear(updatedGear);
          setGearMessages(updatedGear.messages);
          setExampleInputs(updatedGear.exampleInputs);
          setLogEntries(updatedGear.log || []);
          
          // We no longer need to update node labels - the GearNode gets label directly from Firestore
          console.log(`Subscription update (server gear): received updated gear with label="${updatedGear.label}"`);
        });
        
        setUnsubscribeGear(() => unsubscribe);
      } else {
        // No gear found anywhere
        console.log(`No gear ${gearId} found anywhere, creating new`);
        
        // Use current node label if it's meaningful
        const nodeLabel = currentNodeData && typeof currentNodeData.label === 'string' ? currentNodeData.label : '';
        const gearIdPrefix = typeof gearId === 'string' ? gearId.slice(0, 8) : '';
        
        const initialLabel = nodeLabel && !nodeLabel.startsWith(`Gear ${gearIdPrefix}`)
          ? nodeLabel
          : undefined; // Use default label from Gear constructor
        
        gear = await Gear.create({
          id: gearId as string,
          messages: [
            {
              role: "system" as const,
              content: "You are a Gear that processes inputs and produces outputs. You can be configured with instructions."
            }
          ],
          label: initialLabel
        });
        
        setSelectedGear(gear);
        setGearMessages(gear.messages);
        setExampleInputs([]);
        setLogEntries([]);
        
        // Subscribe to real-time updates
        const unsubscribe = gear.subscribeToUpdates((updatedGear) => {
          setSelectedGear(updatedGear);
          setGearMessages(updatedGear.messages);
          setExampleInputs(updatedGear.exampleInputs);
          setLogEntries(updatedGear.log || []);
          
          // We no longer need to update node labels - the GearNode gets label directly from Firestore
          console.log(`Subscription update (new gear): received updated gear with label="${updatedGear.label}"`);
        });
        
        setUnsubscribeGear(() => unsubscribe);
      }
    } catch (error) {
      console.error(`Error loading gear ${gearId}:`, error);
      setGearMessages([]);
      setExampleInputs([]);
      setLogEntries([]);
    }
  }, [nodes, selectedNode, unsubscribeGear, currentPatch, setSelectedGear, setGearMessages, setExampleInputs, setLogEntries, setNodes, setUnsubscribeGear]);
  
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
    } as any);
    
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
      // Use the selected gear instance if available, otherwise find it
      const gear = selectedGear || await Gear.findById(gearId as string);
      if (gear) {
        await gear.addMessage({
          role: message.role as "user" | "assistant" | "system",
          content: message.content
        });
        
        // Real-time updates will be handled by the subscription
        // Processing state is managed server-side in the API route
      }
    } catch (error) {
      console.error("Error sending message to gear:", error);
    }
  }, [selectedNode, nodes, selectedGear]);

  // Example input handlers
  const handleAddExample = async (name: string, inputData: string) => {
    if (!selectedNode) return;
    
    const node = nodes.find(n => n.id === selectedNode);
    if (!node?.data?.gearId) return;
    
    const gearId = node.data.gearId;
    
    try {
      // Use the selected gear or find it
      const gear = selectedGear || await Gear.findById(gearId);
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
        
        // Real-time updates will be handled by the subscription
        // Processing state is managed server-side in the API route
      }
    } catch (error) {
      console.error("Error adding example input:", error);
    }
  };
  
  const handleUpdateExample = async (id: string, name: string, inputData: string) => {
    if (!selectedNode) return;
    
    const node = nodes.find(n => n.id === selectedNode);
    if (!node?.data?.gearId) return;
    
    const gearId = node.data.gearId;
    
    try {
      // Use the selected gear or find it
      const gear = selectedGear || await Gear.findById(gearId);
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
        
        // Real-time updates will be handled by the subscription
        // Processing state is managed server-side in the API route
      }
    } catch (error) {
      console.error("Error updating example input:", error);
    }
  };
  
  const handleDeleteExample = async (id: string) => {
    if (!selectedNode) return;
    
    const node = nodes.find(n => n.id === selectedNode);
    if (!node?.data?.gearId) return;
    
    const gearId = node.data.gearId;
    
    try {
      // Use the selected gear or find it
      const gear = selectedGear || await Gear.findById(gearId);
      if (gear) {
        await gear.deleteExampleInput(id);
        
        // Real-time updates will be handled by the subscription
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
      // Use the selected gear or find it
      const gear = selectedGear || await Gear.findById(gearId);
      if (gear) {
        await gear.processExampleInput(id);
        
        // Real-time updates will be handled by the subscription
        // Processing state is managed server-side in the API route
      }
    } catch (error) {
      console.error("Error processing example input:", error);
    }
  };
  
  const handleProcessAllExamples = async () => {
    if (!selectedNode) return;
    
    const node = nodes.find(n => n.id === selectedNode);
    if (!node?.data?.gearId) return;
    
    const gearId = node.data.gearId;
    
    try {
      // Use the selected gear or find it
      const gear = selectedGear || await Gear.findById(gearId);
      if (gear) {
        await gear.processAllExamples();
        
        // Real-time updates will be handled by the subscription
        // Processing state is managed server-side in the API route
      }
    } catch (error) {
      console.error("Error processing all example inputs:", error);
    }
  };
  
  // Handle sending an example output to connected gears
  const handleSendOutput = async (exampleId: string, output: any) => {
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
      
      // Get the gear to access its outputUrls
      const gear = selectedGear || await Gear.findById(gearId);
      if (gear) {
        // Call the API directly without the no_forward parameter
        // This allows forwarding to connected gears
        console.log(`Processing and forwarding example output from ${gear.label} (${gear.id})`);
        
        // For the "Send Output" button case:
        // We DON'T want to create a log in gear A (the sender) but DO want logs in the receiving gears
        // So we use create_log=false for this gear, but the receiving gears should create logs
        await fetch(`/api/gears/${gear.id}?create_log=false`, {
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: output,
            source: 'example'
          })
        });
        
        console.log(`DEBUG - Send Output: Called API on server for gear ${gear.id} with example output`);
        
        console.log(`Sent output from example ${exampleId} to ${gear.outputUrls.length} connected gears`);
      } else {
        console.error(`Could not find gear ${gearId}`);
      }
    } catch (error) {
      console.error("Error sending example output:", error);
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

  // Handle clearing the log for the selected gear
  const handleClearLog = async () => {
    if (!selectedNode) return;
    
    const node = nodes.find(n => n.id === selectedNode);
    if (!node?.data?.gearId) return;
    
    const gearId = node.data.gearId;
    
    try {
      console.log(`Clearing log for gear ${gearId}`);
      
      // Use the selected gear or find it
      const gear = selectedGear || await Gear.findById(gearId);
      if (gear) {
        await gear.clearLog();
        
        // Update local log entries state immediately for UI feedback
        setLogEntries([]);
        
        // Real-time updates will handle the rest
      }
    } catch (error) {
      console.error("Error clearing gear log:", error);
    }
  };

  // Initialize the flow once with a consistent zoom level
  useEffect(() => {
    if (reactFlowInstance && nodes.length === 0) {
      // Set a default viewport for empty canvas
      reactFlowInstance.setViewport({ x: 0, y: 0, zoom: 1 });
    }
  }, [reactFlowInstance, nodes.length]);
  
  // We no longer need to listen for gear label changes
  // Each GearNode component gets its label directly from Firestore
  
  // Handler for when connection interaction starts
  const onConnectStart = useCallback(() => {
    setIsConnecting(true);
  }, [setIsConnecting]);
  
  // Handler for when connection interaction is canceled/aborted
  const onConnectEnd = useCallback(() => {
    // Check if there was an active connection that failed
    const connectingLine = document.querySelector('.react-flow__connection-path');
    if (!connectingLine) {
      // Connection attempt was aborted, reset state right away
      setIsConnecting(false);
    } else {
      // Connection is still in progress, use a small delay
      setTimeout(() => {
        setIsConnecting(false);
      }, 100);
    }
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
          // Save to server using the currentPatch if available
          if (currentPatch) {
            await currentPatch.removeNode(nodeId);
          } else {
            // Fallback to finding the patch again
            const patch = await Patch.findById(patchId);
            if (patch) {
              await patch.removeNode(nodeId);
            }
          }
        } catch (error) {
          console.error(`Error removing node ${nodeId}:`, error);
        }
      });
      
      // If a node was deleted, and it was the selected node, deselect it
      if (selectedNode && nodeDeletions.some(deletion => deletion.id === selectedNode)) {
        setSelectedNode(null);
        // Unsubscribe from gear updates
        if (unsubscribeGear) {
          unsubscribeGear();
          setUnsubscribeGear(null);
        }
      }
    },
    [selectedNode, patchId, setDataModified, currentPatch, unsubscribeGear]
  );
  
  // Handle edge changes
  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      setEdges((eds) => applyEdgeChanges(changes, eds) as Edge[]);
      
      // Mark data as modified if edges are added or removed
      if (changes.some(change => change.type === 'remove')) {
        setDataModified(true);
        
        // Process edge deletions to update server state
        const edgeDeletions = changes.filter(change => change.type === 'remove');
        
        edgeDeletions.forEach(async (deletion) => {
          const edgeId = deletion.id;
          try {
            // Use the currentPatch if available
            if (currentPatch) {
              await currentPatch.removeEdge(edgeId);
            } else {
              // Fallback to finding the patch again
              const patch = await Patch.findById(patchId);
              if (patch) {
                await patch.removeEdge(edgeId);
              }
            }
          } catch (error) {
            console.error(`Error removing edge ${edgeId}:`, error);
          }
        });
      }
    },
    [setDataModified, patchId, currentPatch]
  );
  
  // Effect to save changes when nodes are dragged or repositioned or edges are changed
  useEffect(() => {
    // Only save changes if data was modified
    if (dataModified && currentPatch) {
      // Save after a small delay to avoid too many saves during rapid changes
      const timeoutId = setTimeout(async () => {
        try {
          console.log(`Saving patch data with ${nodes.length} nodes and ${edges.length} edges`);
          
          // Update the patch with the current ReactFlow data
          await currentPatch.updateFromReactFlow({
            nodes,
            edges
          });
          
          // Reset the dataModified flag after successful save
          setDataModified(false);
        } catch (error) {
          console.error("Error saving ReactFlow data:", error);
        }
      }, 1000); // 1 second debounce
      
      return () => clearTimeout(timeoutId);
    }
  }, [nodes, edges, dataModified, currentPatch]);
  
  // Debug effect to log nodes and edges
  useEffect(() => {
    console.log(`Current patch state: ${nodes.length} nodes and ${edges.length} edges`);
  }, [nodes.length, edges.length]);

  return (
    <div className="container mx-auto p-4 flex h-[calc(100vh-3.5rem)]">
      <div className="flex-1 pr-4">
        <Card className="h-full">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
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
              {!isLoading && (
                <div className="text-gray-500 text-sm mt-1 px-2">
                  {patchDescription || "No description"}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="h-[calc(100%-5rem)]">
            <div className="h-full w-full">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onConnectStart={onConnectStart}
                onConnectEnd={onConnectEnd}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                onInit={(instance) => {
                  console.log("ReactFlow initialized");
                  console.log("Initial nodes:", nodes);
                  console.log("Initial edges:", edges);
                  setReactFlowInstance(instance as any);
                }}
                nodesDraggable={true}
                fitView={false}
                defaultViewport={{ x: 0, y: 0, zoom: 1 }}
                proOptions={{ hideAttribution: true }}
                defaultEdgeOptions={{ type: 'default' }}
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
              onClick={() => {
                setSelectedNode(null);
                // Unsubscribe from gear updates
                if (unsubscribeGear) {
                  unsubscribeGear();
                  setUnsubscribeGear(null);
                }
                setSelectedGear(null);
              }}
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
              logEntries={logEntries}
              onAddExample={handleAddExample}
              onUpdateExample={handleUpdateExample}
              onDeleteExample={handleDeleteExample}
              onProcessExample={handleProcessExample}
              onProcessAllExamples={handleProcessAllExamples}
              onSendOutput={handleSendOutput}
              onClearLog={handleClearLog}
            />
          </div>
        </div>
      )}
    </div>
  );
}