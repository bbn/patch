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
import { ExampleInput, GearLogEntry } from "@/lib/models/Gear";

interface ChatSidebarProps {
  gearId: string;
  initialMessages: { id?: string; role: string; content: string }[];
  onMessageSent: (message: { role: string; content: string }) => void;
  exampleInputs: ExampleInput[];
  logEntries?: GearLogEntry[];
  onAddExample: (name: string, input: string) => Promise<void>;
  onUpdateExample: (id: string, name: string, input: string) => Promise<void>;
  onDeleteExample: (id: string) => Promise<void>;
  onProcessExample: (id: string) => Promise<void>;
  onProcessAllExamples: () => Promise<void>;
  onSendOutput?: (id: string, output: any) => Promise<void>;
  onClearLog?: () => Promise<void>;
  onClose?: () => void;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  gearId,
  initialMessages,
  onMessageSent,
  exampleInputs,
  logEntries = [],
  onAddExample,
  onUpdateExample,
  onDeleteExample,
  onProcessExample,
  onProcessAllExamples,
  onSendOutput,
  onClearLog,
  onClose,
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

  const [activeTab, setActiveTab] = useState<'chat' | 'examples' | 'log'>('chat');

  return (
    <div className="w-full h-full flex flex-col bg-white text-sm">
      
      {/* Tabs */}
      <div className="p-2 border-b flex justify-center">
        <div className="flex">
          <Button
            variant={activeTab === 'chat' ? 'default' : 'outline'}
            onClick={() => setActiveTab('chat')}
            size="sm"
            className="rounded-r-none text-xs"
          >
            Chat
          </Button>
          <Button
            variant={activeTab === 'examples' ? 'default' : 'outline'}
            onClick={() => setActiveTab('examples')}
            size="sm" 
            className="rounded-none text-xs border-l-0 border-r-0"
          >
            Examples
          </Button>
          <Button
            variant={activeTab === 'log' ? 'default' : 'outline'}
            onClick={() => setActiveTab('log')}
            size="sm" 
            className="rounded-l-none text-xs"
          >
            Log
          </Button>
        </div>
      </div>

      {/* Chat Tab */}
      {activeTab === 'chat' && (
        <>
          {/* Messages container */}
          <div className="flex-grow overflow-y-auto p-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`mb-2 ${m.role === "user" ? "text-right" : "text-left"}`}
              >
                <span
                  className={`inline-block p-1.5 rounded-lg text-xs ${m.role === "user" ? "bg-blue-500 text-white" : "bg-gray-200 text-black"}`}
                >
                  {m.content}
                </span>
              </div>
            ))}
            {isLoading && (
              <div className="text-left">
                <span className="inline-block p-1.5 rounded-lg text-xs bg-gray-200 text-black">
                  AI is thinking...
                </span>
              </div>
            )}
          </div>
          
          {/* Input form */}
          <div className="p-2 border-t mt-auto">
            <form onSubmit={handleFormSubmit} className="flex w-full space-x-2">
              <Input
                value={input}
                onChange={handleInputChange}
                placeholder="Type your message..."
                className="flex-grow text-xs"
              />
              <Button type="submit" disabled={isLoading} className="text-xs">
                Send
              </Button>
            </form>
          </div>
        </>
      )}

      {/* Examples Tab */}
      {activeTab === 'examples' && (
        <div className="flex-grow overflow-y-auto p-2">
          <ExampleInputPanel
            gearId={gearId}
            examples={exampleInputs}
            onAddExample={onAddExample}
            onUpdateExample={onUpdateExample}
            onDeleteExample={onDeleteExample}
            onProcessExample={onProcessExample}
            onProcessAllExamples={onProcessAllExamples}
            onSendOutput={onSendOutput}
          />
        </div>
      )}

      {/* Log Tab */}
      {activeTab === 'log' && (
        <div className="flex-grow overflow-y-auto p-2">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-medium">Activity Log ({logEntries.length})</h3>
            {logEntries.length > 0 && onClearLog && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onClearLog}
                className="text-xs h-7 px-2 py-1"
              >
                Clear Log
              </Button>
            )}
          </div>
          {logEntries.length === 0 ? (
            <div className="text-gray-500 text-xs p-2 text-center">
              No activity logged yet for gear {gearId}
            </div>
          ) : (
            <div className="border rounded-md overflow-hidden">
              {logEntries.map((entry, index) => {
                // Debug logging for each entry
                console.log(`Log entry ${index}:`, {
                  source: entry.source,
                  timestamp: entry.timestamp,
                  hasInput: !!entry.input,
                  hasOutput: !!entry.output
                });
                
                return (
                  <div 
                    key={`${entry.timestamp}-${index}`} 
                    className={`border-b last:border-b-0 p-3 ${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}
                  >
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <div>{formatSource(entry.source)}</div>
                      <div>{formatTimestamp(entry.timestamp)}</div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-xs font-medium mb-1">Input:</div>
                        <div className="text-xs overflow-auto max-h-20 whitespace-pre-wrap bg-gray-100 p-1 rounded">
                          {formatContent(entry.input)}
                        </div>
                      </div>
                      
                      <div>
                        <div className="text-xs font-medium mb-1">Output:</div>
                        <div className="text-xs overflow-auto max-h-20 whitespace-pre-wrap bg-gray-100 p-1 rounded">
                          {entry.output ? formatContent(entry.output) : 'No output'}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Format timestamp to readable date/time
const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  // Check if the date is today
  if (date.toDateString() === today.toDateString()) {
    return `Today at ${date.toLocaleTimeString()}`;
  }
  
  // Check if the date is yesterday
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday at ${date.toLocaleTimeString()}`;
  }
  
  // Otherwise, show the full date and time
  return date.toLocaleString();
};

// Format input/output for display
const formatContent = (content: string | Record<string, unknown>): string => {
  if (typeof content === 'string') {
    return content;
  }
  return JSON.stringify(content, null, 2);
};

// Format source to display the label
const formatSource = (source: any): string => {
  if (!source) return 'direct';
  
  if (typeof source === 'string') {
    return source;
  }
  
  if (typeof source === 'object' && source !== null) {
    if (source.label) {
      return source.label;
    }
    if (source.id) {
      return source.id;
    }
  }
  
  return 'unknown';
};
