"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Patch } from "@/lib/models/Patch";

interface PatchSummary {
  id: string;
  name: string;
  description?: string;
  updatedAt: number;
  nodeCount: number;
  isEditing?: boolean;
}

export default function PatchesPage() {
  const router = useRouter();
  const [patches, setPatches] = useState<PatchSummary[]>([]);
  const [newPatchName, setNewPatchName] = useState("");
  const [loading, setLoading] = useState(true);

  const loadPatches = async () => {
    try {
      setLoading(true);
      
      // Try to load patches from localStorage first for immediate display
      let patchList: PatchSummary[] = [];
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('patches');
        if (saved) {
          patchList = JSON.parse(saved);
          // Sort and show immediately
          const sortedPatches = [...patchList].sort((a, b) => b.updatedAt - a.updatedAt);
          setPatches(sortedPatches);
        }
      }
      
      // Then try to load from the server model
      try {
        // Bypass localStorage cache by directly fetching from API
        const response = await fetch('/api/patches', { 
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        });
        
        if (response.ok) {
          const freshPatches = await response.json();
          
          // Log details for debugging
          freshPatches.forEach((patch: PatchSummary) => {
            console.log(`API: Patch ${patch.id} - ${patch.name} has ${patch.nodeCount} nodes`);
          });
          
          // Sort patches by updatedAt in reverse chronological order
          const sortedPatches = [...freshPatches].sort((a, b) => b.updatedAt - a.updatedAt);
          setPatches(sortedPatches);
          
          // Update localStorage with the sorted fresh data
          if (typeof window !== 'undefined') {
            localStorage.setItem('patches', JSON.stringify(sortedPatches));
          }
          return;
        }
        
        // If API fails, fallback to direct model access
        const allPatches = await Patch.findAll();
        if (allPatches.length > 0) {
          patchList = allPatches.map(patch => {
            console.log(`Model: Patch ${patch.id} - ${patch.name} has ${patch.nodes.length} nodes:`, patch.nodes);
            return {
              id: patch.id,
              name: patch.name,
              description: patch.description,
              updatedAt: patch.updatedAt,
              nodeCount: patch.nodes.length || 0
            };
          });
          
          // Sort patches by updatedAt in reverse chronological order
          const sortedPatches = [...patchList].sort((a, b) => b.updatedAt - a.updatedAt);
          
          // Update localStorage with the sorted server data
          if (typeof window !== 'undefined') {
            localStorage.setItem('patches', JSON.stringify(sortedPatches));
          }
          
          setPatches(sortedPatches);
        }
      } catch (error) {
        console.error("Error loading patches from server:", error);
        // Continue with localStorage data if server fetch fails
      }
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    loadPatches();
  }, []);

  const handleCreatePatch = async () => {
    // If name is empty, use a default name
    const patchName = newPatchName.trim() || "New Patch";
    
    const patchId = `patch-${Date.now()}`;
    const newPatch = {
      id: patchId,
      name: patchName,
      description: "",
      updatedAt: Date.now(),
      nodeCount: 0
    };
    
    // Add to local state
    setPatches(prevPatches => [...prevPatches, newPatch]);
    
    // Save to localStorage
    if (typeof window !== 'undefined') {
      const currentPatches = JSON.parse(localStorage.getItem('patches') || '[]');
      localStorage.setItem('patches', JSON.stringify([...currentPatches, newPatch]));
    }
    
    // Create in the model
    try {
      await Patch.create({
        id: patchId,
        name: patchName
      });
    } catch (error) {
      console.error("Error creating patch:", error);
    }
    
    // Reset input
    setNewPatchName("");
    
    // Navigate to the new patch
    router.push(`/patches/${patchId}`);
  };

  const handlePatchClick = (patchId: string) => {
    router.push(`/patches/${patchId}`);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };
  
  const startEditing = (e: React.MouseEvent, patchId: string) => {
    e.stopPropagation();
    setPatches(prevPatches => 
      prevPatches.map(patch => 
        patch.id === patchId 
          ? { ...patch, isEditing: true } 
          : patch
      )
    );
  };
  
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>, patchId: string) => {
    setPatches(prevPatches => 
      prevPatches.map(patch => 
        patch.id === patchId 
          ? { ...patch, name: e.target.value } 
          : patch
      )
    );
  };
  
  const savePatchName = async (e: React.FormEvent<HTMLFormElement> | React.FocusEvent<HTMLInputElement>, patchId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Find the patch to save
    const patchToSave = patches.find(p => p.id === patchId);
    if (!patchToSave) return;
    
    // Exit edit mode first to improve UX responsiveness
    setPatches(prevPatches => 
      prevPatches.map(patch => 
        patch.id === patchId 
          ? { ...patch, isEditing: false } 
          : patch
      )
    );
    
    try {
      // Update in localStorage first for immediate feedback
      if (typeof window !== 'undefined') {
        const currentPatches = JSON.parse(localStorage.getItem('patches') || '[]');
        const updatedLocalPatches = currentPatches.map((p: PatchSummary) => 
          p.id === patchId ? { ...p, name: patchToSave.name, updatedAt: Date.now() } : p
        );
        localStorage.setItem('patches', JSON.stringify(updatedLocalPatches));
      }
      
      // Update via API
      const response = await fetch(`/api/patches/${patchId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: patchToSave.name
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to update patch name:', errorText);
        
        // If API fails but localStorage worked, user will still see changes 
        // until the page is refreshed, but the change won't persist to server
      }
    } catch (error) {
      console.error('Error updating patch name:', error);
    }
  };

  return (
    <div className="container mx-auto p-4">

      {loading ? (
        <div className="flex justify-center p-8">
          <p>Loading patches...</p>
        </div>
      ) : patches.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <p className="text-gray-500">No patches yet. Create your first patch!</p>
          <Button onClick={handleCreatePatch} className="mt-4">
            Create Patch
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card 
            className="cursor-pointer hover:shadow-md transition-shadow bg-gray-50 border-dashed border-2 flex flex-col items-center justify-center text-center p-6"
            onClick={handleCreatePatch}
          >
            <div className="text-4xl mb-2">+</div>
            <CardTitle>Create New Patch</CardTitle>
          </Card>
          
          {patches.map((patch) => (
            <Card 
              key={patch.id} 
              className="hover:shadow-md transition-shadow"
              onClick={() => !patch.isEditing && handlePatchClick(patch.id)}
            >
              <CardHeader className="pb-2">
                {patch.isEditing ? (
                  <form 
                    onSubmit={(e) => savePatchName(e, patch.id)} 
                    onClick={(e) => e.stopPropagation()}
                    className="w-full"
                  >
                    <Input
                      autoFocus
                      value={patch.name}
                      onChange={(e) => handleNameChange(e, patch.id)}
                      onBlur={(e) => savePatchName(e, patch.id)}
                      className="font-semibold text-xl"
                    />
                  </form>
                ) : (
                  <CardTitle 
                    onClick={(e) => startEditing(e, patch.id)}
                    className="cursor-text hover:bg-gray-50 px-2 py-1 rounded -mx-2 transition-colors"
                  >
                    {patch.name}
                  </CardTitle>
                )}
              </CardHeader>
              <CardContent>
                <p className="text-gray-500">{patch.description || "No description"}</p>
                <div className="mt-2 text-sm text-gray-600">
                  {patch.nodeCount} gear{patch.nodeCount !== 1 ? 's' : ''}
                </div>
              </CardContent>
              <CardFooter className="text-xs text-gray-400">
                Last updated: {formatDate(patch.updatedAt)}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}