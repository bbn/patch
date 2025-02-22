"use client";

import { useChat } from "ai/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { KeyboardEvent } from "react";

import { GearData, Message } from "@/lib/models/Gear";
type Gear = GearData & {
  inputMessage?: string;
  outputMessage?: string;
};

interface GearComponentProps {
  gear: Gear;
  setGears: (gears: Gear[]) => void;
  gears: Gear[];
}

export function GearComponent({ gear, setGears, gears }: GearComponentProps) {
  const { messages, input, handleInputChange, handleSubmit, setMessages } =
    useChat({
      api: `/api/gears/${gear.id}/chat`,
    });

  const handleUrlKeyPress = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const newUrl = (e.target as HTMLInputElement).value;
      setGears(
        gears.map((g) =>
          g.id === gear.id
            ? { ...g, outputUrls: [...g.outputUrls, newUrl] }
            : g,
        ),
      );
      (e.target as HTMLInputElement).value = "";
    }
  };

  const updateMessages = (outputMessage: string) => {
    setMessages([
      ...messages,
      { role: "user", content: `Input: ${gear.inputMessage || ""}` },
      { role: "assistant", content: outputMessage },
    ]);

    setGears(
      gears.map((g) => (g.id === gear.id ? { ...g, outputMessage } : g)),
    );
  };

  // Render Sections
  const renderMessageHistory = () => (
    <div className="h-40 overflow-y-auto mb-4 border p-2 rounded">
      {messages.map((m, index) => (
        <div key={index} className="mb-2">
          <strong>{m.role}:</strong> {m.content}
        </div>
      ))}
    </div>
  );

  const renderUrlSection = () => (
    <>
      <div className="mb-2">
        <Input placeholder="Add output URL" onKeyPress={handleUrlKeyPress} />
      </div>
      <div>
        <h3 className="font-semibold">Output URLs:</h3>
        <ul>
          {gear.outputUrls.map((url, index) => (
            <li key={index}>{url}</li>
          ))}
        </ul>
      </div>
    </>
  );

  const renderChatInput = () => (
    <form onSubmit={handleSubmit} className="flex w-full space-x-2">
      <Input
        value={input}
        onChange={handleInputChange}
        placeholder="Type your message..."
        className="flex-grow"
      />
      <Button type="submit">Send</Button>
    </form>
  );

  return (
    <Card className="w-full">
      <CardContent>
        <h2 className="text-xl font-semibold mb-2">
          <a
            href={`/gears/${gear.id}`}
            className="text-blue-600 hover:underline"
          >
            {gear.id}
          </a>
        </h2>
        {renderMessageHistory()}
        {renderUrlSection()}
      </CardContent>
      <CardFooter>{renderChatInput()}</CardFooter>
    </Card>
  );
}
