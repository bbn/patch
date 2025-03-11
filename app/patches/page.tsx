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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  const [refreshing, setRefreshing] = useState(false);

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
      
      // Then try to load from the server model - ALWAYS get fresh data
      try {
        // Bypass all caching by using a timestamp parameter
        const timestamp = Date.now();
        const response = await fetch(`/api/patches?t=${timestamp}`, { 
          cache: 'no-store',
          headers: { 
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        
        if (response.ok) {
          const freshPatches = await response.json();
          
          // Log details for debugging
          freshPatches.forEach((patch: PatchSummary) => {
            console.log(`API: Patch ${patch.id} - ${patch.name} has ${patch.nodeCount} nodes, description: "${patch.description}"`);
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
        
        // If API fails, fallback to direct model access with fresh data from KV
        const allPatches = await Patch.findAll();
        if (allPatches.length > 0) {
          // For each patch, ensure we have fresh data with an individual lookup
          const freshPatchPromises = allPatches.map(async patch => {
            try {
              // Force a fresh lookup from KV storage for each patch
              const freshPatch = await Patch.findById(patch.id);
              if (freshPatch) {
                console.log(`Model: Patch ${patch.id} - ${freshPatch.name} has ${freshPatch.nodes.length} nodes, description: "${freshPatch.description}"`);
                return {
                  id: freshPatch.id,
                  name: freshPatch.name,
                  description: freshPatch.description,
                  updatedAt: freshPatch.updatedAt,
                  nodeCount: freshPatch.nodes.length || 0
                };
              }
            } catch (err) {
              console.error(`Error getting fresh data for patch ${patch.id}:`, err);
            }
            
            // Fallback to the original patch data if fresh lookup fails
            return {
              id: patch.id,
              name: patch.name,
              description: patch.description,
              updatedAt: patch.updatedAt,
              nodeCount: patch.nodes.length || 0
            };
          });
          
          // Wait for all fresh patch data
          patchList = await Promise.all(freshPatchPromises);
          
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
  
  // Function to regenerate all patch descriptions and refresh the list
  const handleRegenerateDescriptions = async () => {
    setRefreshing(true);
    try {
      // Call the API to regenerate all descriptions
      const response = await fetch('/api/patches?regenerate_all_descriptions=true', {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' }
      });
      
      if (response.ok) {
        console.log('Descriptions regenerated successfully');
        // Reload the patches list to get updated descriptions
        await loadPatches();
      } else {
        console.error('Failed to regenerate descriptions');
      }
    } catch (error) {
      console.error('Error regenerating descriptions:', error);
    } finally {
      setRefreshing(false);
    }
  };

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
      
      if (success) {
        // Remove from state if delete was successful
        setPatches(prevPatches => prevPatches.filter(patch => patch.id !== patchId));
      } else {
        // If delete failed, revert the UI
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
      {/* Header with refresh button */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Patches</h1>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRegenerateDescriptions} 
                disabled={refreshing || loading}
              >
                {refreshing ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Updating...
                  </>
                ) : (
                  <>
                    <svg className="mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38"/>
                    </svg>
                    Refresh Descriptions
                  </>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Regenerate all patch descriptions using AI</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

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