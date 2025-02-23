"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GearComponent } from "@/components/GearComponent";
import { ChatSidebar } from "@/components/ChatSidebar";

interface Gear {
  id: string;
  outputUrls: string[];
  messages: { role: string; content: string }[];
}

export default function Home() {
  const [gears, setGears] = useState<Gear[]>(() => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('gears');
    return saved ? JSON.parse(saved) : [];
  }
  return [];
});
  const [selectedGear, setSelectedGear] = useState<string | null>(null);

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
          ? { ...gear, messages: [...gear.messages, message] }
          : gear,
      ),
    );
  };

  return (
    <div className="container mx-auto p-4 flex h-screen">
      <div className="flex-1 pr-4">
        <h1 className="text-2xl font-bold mb-4">Gears Project</h1>
        <Button onClick={addGear} className="mb-4">
          Add Gear
        </Button>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {gears.map((gear) => (
            <GearComponent
              key={gear.id}
              gear={gear}
              onSelect={handleGearSelect}
            />
          ))}
        </div>
      </div>
      {selectedGear && (
        <div className="w-1/3 border-l pl-4">
          <ChatSidebar
            gearId={selectedGear}
            onMessageSent={(message) =>
              handleMessageSent(selectedGear, message)
            }
          />
        </div>
      )}
    </div>
  );
}
