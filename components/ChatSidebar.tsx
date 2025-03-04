"use client";

import { useState, useEffect } from "react";
import { useChat } from "ai/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

import { ExampleInputPanel } from "./ExampleInputPanel";
import { ExampleInput } from "@/lib/models/Gear";

interface ChatSidebarProps {
  gearId: string;
  initialMessages: { id?: string; role: string; content: string }[];
  onMessageSent: (message: { role: string; content: string }) => void;
  exampleInputs: ExampleInput[];
  onAddExample: (name: string, input: string) => Promise<void>;
  onUpdateExample: (id: string, name: string, input: string) => Promise<void>;
  onDeleteExample: (id: string) => Promise<void>;
  onProcessExample: (id: string) => Promise<void>;
  onProcessAllExamples: () => Promise<void>;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  gearId,
  initialMessages,
  onMessageSent,
  exampleInputs,
  onAddExample,
  onUpdateExample,
  onDeleteExample,
  onProcessExample,
  onProcessAllExamples,
}) => {
  // Format initialMessages for the useChat hook
  const formattedInitialMessages = initialMessages.map(msg => ({
    id: msg.id || crypto.randomUUID(),
    role: msg.role as "system" | "user" | "assistant" | "data",
    content: msg.content
  }));

  // Use the Vercel AI SDK useChat hook
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: `/api/gears/${gearId}/chat`,
    id: `chat-${gearId}`,
    initialMessages: formattedInitialMessages,
    onResponse: (response) => {
      if (!response.ok) {
        console.warn(`Chat API error: ${response.status} ${response.statusText}`);
      }
    },
    onFinish: (message) => {
      // When the AI response is complete, send it to the parent component
      if (message.content && message.role === "assistant") {
        onMessageSent({
          role: message.role,
          content: message.content
        });
      }
    },
  });

  // When user sends a message, we need to notify the parent
  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Only proceed if there's content to send
    if (!input.trim()) return;
    
    // Save the current message to pass to onMessageSent after submission
    const currentMessage = input.trim();
    
    // Submit the form using the handler from useChat
    handleSubmit(e);
    
    // Notify parent of the new user message
    onMessageSent({
      role: "user",
      content: currentMessage
    });
  };

  const [activeTab, setActiveTab] = useState<'chat' | 'examples'>('chat');

  return (
    <div className="w-full h-full flex flex-col border rounded-md">
      {/* Header with tabs */}
      <div className="p-4 border-b flex justify-end items-center">
        <div className="flex">
          <Button
            variant={activeTab === 'chat' ? 'default' : 'outline'}
            onClick={() => setActiveTab('chat')}
            size="sm"
            className="rounded-r-none"
          >
            Chat
          </Button>
          <Button
            variant={activeTab === 'examples' ? 'default' : 'outline'}
            onClick={() => setActiveTab('examples')}
            size="sm" 
            className="rounded-l-none"
          >
            Examples
          </Button>
        </div>
      </div>

      {/* Chat Tab */}
      {activeTab === 'chat' && (
        <>
          {/* Messages container */}
          <div className="flex-grow overflow-y-auto p-4">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`mb-4 ${m.role === "user" ? "text-right" : "text-left"}`}
              >
                <span
                  className={`inline-block p-2 rounded-lg ${m.role === "user" ? "bg-blue-500 text-white" : "bg-gray-200 text-black"}`}
                >
                  {m.content}
                </span>
              </div>
            ))}
            {isLoading && (
              <div className="text-left">
                <span className="inline-block p-2 rounded-lg bg-gray-200 text-black">
                  AI is thinking...
                </span>
              </div>
            )}
          </div>
          
          {/* Input form */}
          <div className="p-4 border-t mt-auto">
            <form onSubmit={handleFormSubmit} className="flex w-full space-x-2">
              <Input
                value={input}
                onChange={handleInputChange}
                placeholder="Type your message..."
                className="flex-grow"
              />
              <Button type="submit" disabled={isLoading}>
                Send
              </Button>
            </form>
          </div>
        </>
      )}

      {/* Examples Tab */}
      {activeTab === 'examples' && (
        <div className="flex-grow overflow-y-auto p-4">
          <ExampleInputPanel
            gearId={gearId}
            examples={exampleInputs}
            onAddExample={onAddExample}
            onUpdateExample={onUpdateExample}
            onDeleteExample={onDeleteExample}
            onProcessExample={onProcessExample}
            onProcessAllExamples={onProcessAllExamples}
          />
        </div>
      )}
    </div>
  );
};
