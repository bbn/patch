"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Patch } from "@/lib/models/Patch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface PatchSummary {
  id: string;
  name: string;
  description?: string;
  updatedAt: number;
  nodeCount: number;
  isDeleting?: boolean;
}

export default function PatchesPage() {
  const router = useRouter();
  const [patches, setPatches] = useState<PatchSummary[]>([]);
  const [newPatchName, setNewPatchName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initial load from localStorage for immediate display
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('patches');
      if (saved) {
        try {
          const localPatches = JSON.parse(saved);
          const sortedPatches = [...localPatches].sort((a, b) => b.updatedAt - a.updatedAt);
          setPatches(sortedPatches);
          setLoading(false);
        } catch (err) {
          console.error("Error loading patches from localStorage:", err);
        }
      }
    }

    // Subscribe to real-time updates from Firestore
    const unsubscribe = Patch.subscribeToAll((newPatches) => {
      console.log(`Real-time update: Received ${newPatches.length} patches`);
      
      // Convert patches to summary format
      const patchSummaries = newPatches.map(patch => ({
        id: patch.id,
        name: patch.name,
        description: patch.description,
        updatedAt: patch.updatedAt,
        nodeCount: patch.nodes.length
      }));
      
      // Sort patches by updatedAt in reverse chronological order
      const sortedPatches = [...patchSummaries].sort((a, b) => b.updatedAt - a.updatedAt);
      
      // Update state with fresh data
      setPatches(sortedPatches);
      setLoading(false);
      
      // Also update localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('patches', JSON.stringify(sortedPatches));
      }
    });

    // Clean up subscription when component unmounts
    return () => {
      if (unsubscribe) unsubscribe();
    };
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
    
    // Create in the model - Firestore subscription will update our state
    try {
      await Patch.create({
        id: patchId,
        name: patchName
      });
    } catch (error) {
      console.error("Error creating patch:", error);
      // If model creation fails, manually update local state
      setPatches(prevPatches => [...prevPatches, newPatch]);
      
      // Save to localStorage
      if (typeof window !== 'undefined') {
        const currentPatches = JSON.parse(localStorage.getItem('patches') || '[]');
        localStorage.setItem('patches', JSON.stringify([...currentPatches, newPatch]));
      }
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
  
  const handleDeletePatch = async (patchId: string) => {
    // First update UI for immediate feedback
    setPatches(prevPatches => 
      prevPatches.map(patch => 
        patch.id === patchId 
          ? { ...patch, isDeleting: true } 
          : patch
      )
    );
    
    try {
      const success = await Patch.deleteById(patchId);
      
      if (!success) {
        // If delete failed, revert the UI (success case will be handled by Firestore subscription)
        setPatches(prevPatches => 
          prevPatches.map(patch => 
            patch.id === patchId 
              ? { ...patch, isDeleting: false } 
              : patch
          )
        );
        console.error(`Failed to delete patch ${patchId}`);
      }
    } catch (error) {
      // If delete encounters an error, revert the UI
      setPatches(prevPatches => 
        prevPatches.map(patch => 
          patch.id === patchId 
            ? { ...patch, isDeleting: false } 
            : patch
        )
      );
      console.error('Error deleting patch:', error);
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
              className={`hover:shadow-md transition-shadow ${patch.isDeleting ? 'opacity-50' : ''}`}
              onClick={() => !patch.isDeleting && handlePatchClick(patch.id)}
            >
              <CardHeader className="pb-2 flex flex-row justify-between items-start">
                <div className="flex-1">
                  <CardTitle className="px-2 py-1">
                    {patch.name}
                  </CardTitle>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-gray-400 hover:text-red-600 h-8 w-8 p-0"
                      onClick={(e) => e.stopPropagation()}
                      disabled={patch.isDeleting}
                    >
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
                      >
                        <path d="M3 6h18"></path>
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                      </svg>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure you want to delete this patch?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the patch
                        &ldquo;{patch.name}&rdquo; and all of its gear connections.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePatch(patch.id);
                        }}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardHeader>
              <CardContent>
                <p className="text-gray-500">{patch.description || "No description"}</p>
                <div className="mt-2 text-sm text-gray-600">
                  {patch.nodeCount} gear{patch.nodeCount !== 1 ? 's' : ''}
                </div>
              </CardContent>
              <CardFooter className="text-xs text-gray-400 flex justify-between">
                <span>Last updated: {formatDate(patch.updatedAt)}</span>
                {patch.isDeleting && <span className="text-red-500">Deleting...</span>}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}