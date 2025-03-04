"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { GearComponent } from "@/components/GearComponent";
import { ChatSidebar } from "@/components/ChatSidebar";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

interface Gear {
  id: string;
  outputUrls: string[];
  messages: { id: string; role: string; content: string }[];
}

export default function Home() {
  const router = useRouter();
  const [gears, setGears] = useState<Gear[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('gears');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [recentPatches, setRecentPatches] = useState<{id: string; name: string}[]>([]);
  const [selectedGear, setSelectedGear] = useState<string | null>(null);

  useEffect(() => {
    // Load recent patches
    const loadRecentPatches = async () => {
      try {
        // First try to get from API
        const response = await fetch('/api/patches');
        if (response.ok) {
          const patches = await response.json();
          setRecentPatches(
            patches
              .sort((a: { updatedAt: number }, b: { updatedAt: number }) => b.updatedAt - a.updatedAt)
              .slice(0, 3)
              .map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))
          );
          return;
        }
      } catch (error) {
        console.error("Error fetching patches from API:", error);
      }
      
      // Fallback to localStorage
      try {
        const savedPatches = localStorage.getItem('patches');
        if (savedPatches) {
          const patches: Array<{ id: string; name: string; updatedAt: number }> = JSON.parse(savedPatches);
          setRecentPatches(
            patches
              .sort((a: { updatedAt: number }, b: { updatedAt: number }) => b.updatedAt - a.updatedAt)
              .slice(0, 3)
              .map((p: { id: string; name: string; updatedAt: number }) => ({ id: p.id, name: p.name }))
          );
        }
      } catch (error) {
        console.error("Error loading patches from localStorage:", error);
      }
    };
    
    loadRecentPatches();
  }, []);

  const addGear = () => {
    const newGear: Gear = {
      id: `gear-${Date.now()}`,
      outputUrls: [],
      messages: [],
    };
    setGears((prevGears) => {
      const updatedGears = [...prevGears, newGear];
      localStorage.setItem('gears', JSON.stringify(updatedGears));
      return updatedGears;
    });
  };

  const handleGearSelect = (id: string) => {
    setSelectedGear(id);
  };

  const handleMessageSent = (
    gearId: string,
    message: { role: string; content: string },
  ) => {
    setGears((prevGears) =>
      prevGears.map((gear) =>
        gear.id === gearId
          ? { 
              ...gear, 
              messages: [
                ...gear.messages, 
                { ...message, id: crypto.randomUUID() }
              ] 
            }
          : gear,
      ),
    );
  };

  const navigateToNewPatch = () => {
    router.push('/patches');
  };

  return (
    <div className="container mx-auto p-4">
      {/* Welcome section */}
      <div className="mb-8 mt-4">
        <h1 className="text-3xl font-bold mb-2">Welcome to Patch.land</h1>
        <p className="text-lg text-gray-600 mb-4">
          A graphical, reactive programming environment for building data pipelines
        </p>
        <div className="flex space-x-4">
          <Button onClick={navigateToNewPatch} size="lg">
            Create a New Patch
          </Button>
          <Button onClick={addGear} variant="outline" size="lg">
            Create a New Gear
          </Button>
        </div>
      </div>

      {/* Recent patches section */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Recent Patches</h2>
          <Link href="/patches" className="text-blue-600 hover:underline">
            View all patches
          </Link>
        </div>
        
        {recentPatches.length === 0 ? (
          <div className="bg-gray-50 rounded-lg p-6 text-center">
            <p className="text-gray-500">No patches yet. Create your first patch to get started!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {recentPatches.map(patch => (
              <Card key={patch.id} className="cursor-pointer hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle>
                    <Link href={`/patches/${patch.id}`}>{patch.name}</Link>
                  </CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Available gears section */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Available Gears</h2>
          <Button onClick={addGear} variant="outline" size="sm">
            Add Gear
          </Button>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {gears.length === 0 ? (
            <div className="col-span-full text-center text-gray-500 bg-gray-50 p-6 rounded-lg">
              No gears added yet
            </div>
          ) : (
            gears.map((gear) => (
              <div key={gear.id} className="border rounded-lg shadow-sm bg-white">
                <GearComponent
                  gear={gear}
                  onSelect={handleGearSelect}
                />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat sidebar */}
      {selectedGear && (
        <div className="fixed right-0 top-0 w-1/3 h-screen bg-white border-l shadow-lg overflow-auto z-10 p-4">
          <Button 
            variant="ghost" 
            className="absolute top-2 right-2"
            onClick={() => setSelectedGear(null)}
          >
            ✕
          </Button>
          <ChatSidebar
            gearId={selectedGear}
            initialMessages={gears.find(gear => gear.id === selectedGear)?.messages || []}
            onMessageSent={(message) =>
              handleMessageSent(selectedGear, message)
            }
            exampleInputs={[]}
            onAddExample={async () => {}} 
            onUpdateExample={async () => {}} 
            onDeleteExample={async () => {}} 
            onProcessExample={async () => {}} 
            onProcessAllExamples={async () => {}}
          />
        </div>
      )}
    </div>
  );
}
