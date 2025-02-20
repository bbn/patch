"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GearComponent } from "@/components/GearComponent";

interface Gear {
  id: string;
  outputUrls: string[];
  inputMessage: string;
  outputMessage: string;
}

export default function Home() {
  const [gears, setGears] = useState<Gear[]>([]);

  const addGear = () => {
    const newGear: Gear = {
      id: `gear-${gears.length + 1}`,
      outputUrls: [],
      inputMessage: "",
      outputMessage: "",
    };
    setGears([...gears, newGear]);
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Gears Project</h1>
      <Button onClick={addGear} className="mb-4">
        Add Gear
      </Button>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {gears.map((gear) => (
          <GearComponent
            key={gear.id}
            gear={gear}
            setGears={setGears}
            gears={gears}
          />
        ))}
      </div>
    </div>
  );
}
