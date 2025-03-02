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
}

export default function PatchesPage() {
  const router = useRouter();
  const [patches, setPatches] = useState<PatchSummary[]>([]);
  const [newPatchName, setNewPatchName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPatches() {
      try {
        setLoading(true);
        
        // Try to load patches from localStorage first for immediate display
        let patchList: PatchSummary[] = [];
        if (typeof window !== 'undefined') {
          const saved = localStorage.getItem('patches');
          if (saved) {
            patchList = JSON.parse(saved);
          }
        }
        
        // Then try to load from the server model
        try {
          const allPatches = await Patch.findAll();
          if (allPatches.length > 0) {
            patchList = allPatches.map(patch => ({
              id: patch.id,
              name: patch.name,
              description: patch.description,
              updatedAt: patch.updatedAt,
              nodeCount: patch.nodes.length
            }));
            
            // Update localStorage with the server data
            if (typeof window !== 'undefined') {
              localStorage.setItem('patches', JSON.stringify(patchList));
            }
          }
        } catch (error) {
          console.error("Error loading patches from server:", error);
          // Continue with localStorage data if server fetch fails
        }
        
        setPatches(patchList);
      } finally {
        setLoading(false);
      }
    }
    
    loadPatches();
  }, []);

  const handleCreatePatch = async () => {
    if (!newPatchName.trim()) return;
    
    const patchId = `patch-${Date.now()}`;
    const newPatch = {
      id: patchId,
      name: newPatchName.trim(),
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
        name: newPatchName.trim()
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

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Patches</h1>
        <div className="flex space-x-2">
          <Input
            placeholder="New patch name"
            value={newPatchName}
            onChange={(e) => setNewPatchName(e.target.value)}
            className="w-64"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newPatchName.trim()) {
                handleCreatePatch();
              }
            }}
          />
          <Button onClick={handleCreatePatch} disabled={!newPatchName.trim()}>
            Create Patch
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-8">
          <p>Loading patches...</p>
        </div>
      ) : patches.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <p className="text-gray-500">No patches yet. Create your first patch above!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {patches.map((patch) => (
            <Card 
              key={patch.id} 
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => handlePatchClick(patch.id)}
            >
              <CardHeader>
                <CardTitle>{patch.name}</CardTitle>
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