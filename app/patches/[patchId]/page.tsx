
"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChatSidebar } from "@/components/ChatSidebar";

export default function PatchPage() {
  const params = useParams();
  const patchId = params.patchId as string;
  const [gearMessages, setGearMessages] = useState<{ role: string; content: string }[]>([]);

  const handleMessageSent = (message: { role: string; content: string }) => {
    setGearMessages((prev) => [...prev, message]);
  };

  return (
    <div className="container mx-auto p-4 flex h-screen">
      <div className="flex-1 pr-4">
        <Card>
          <CardHeader>
            <CardTitle>Patch {patchId}</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Patch specific content will go here */}
          </CardContent>
        </Card>
      </div>
      <div className="w-1/3 border-l pl-4">
        <ChatSidebar
          gearId={patchId}
          initialMessages={gearMessages}
          onMessageSent={handleMessageSent}
        />
      </div>
    </div>
  );
}
