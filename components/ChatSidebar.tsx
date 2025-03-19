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
import { ExampleInput, GearLogEntry } from "@/lib/models/gear";
import { AnyMessagePart } from "@/lib/models/types";
import { formatMessageParts, toMessageParts, extractTextFromParts } from "@/lib/utils";

// Don't need to redeclare GearLogEntry - it's already declared in the model

interface ChatSidebarProps {
  gearId: string;
  initialMessages: { id?: string; role: string; content: string }[];
  onMessageSent: (message: { role: string; content: string }) => void;
  exampleInputs: ExampleInput[];
  logEntries?: GearLogEntry[];
  onAddExample: (name: string, input: string) => Promise<ExampleInput | undefined | void>;
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
  const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat({
    api: `/api/gears/${gearId}/chat`,
    id: `chat-${gearId}`,
    initialMessages: formattedInitialMessages,
    onResponse: (response) => {
      if (!response.ok) {
        console.warn(`Chat API error: ${response.status} ${response.statusText}`);
        // Log additional details if available
        response.json().then(data => {
          console.error('Chat API error details:', data);
        }).catch(e => {
          console.error('Failed to parse error response:', e);
        });
      } else {
        console.log('Chat API successful response');
      }
    },
    onFinish: (message) => {
      // IMPORTANT FIX: DO NOT call onMessageSent here
      // The server is now responsible for saving the message to avoid duplicates
      if (message.content && message.role === "assistant") {
        console.log('Chat completed successfully, server has already saved the response');
        // No longer calling onMessageSent here since the route.ts API endpoint 
        // now properly handles content parsing and saving
      }
    },
    onError: (error) => {
      console.error('Chat API error in useChat hook:', error);
    }
  });

  // When user sends a message, we need to notify the parent
  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Only proceed if there's content to send
    if (!input.trim()) return;
    
    // IMPORTANT CHANGE: We no longer call onMessageSent here for user messages
    // The server-side endpoint will handle saving the user message
    // This prevents duplicate messages when refreshing the page

    // Just submit the form using the handler from useChat
    // The API endpoint will save the message to the database
    handleSubmit(e);
    
    // Add a log to notify that we're letting the server handle message saving
    console.log('User message sent - server will handle saving');
  };

  const [activeTab, setActiveTab] = useState<'chat' | 'examples' | 'log'>('chat');

  return (
    <div className="w-full h-full flex flex-col text-sm">
      
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
              <div key={m.id} className="mb-3 text-left">
                <div
                  className={`text-xs ${m.role === "user" ? "text-blue-700" : "text-gray-800"}`}
                >
                  {renderMessageContent(m.content, m.role)}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="mb-3 text-left">
                <div className="text-xs text-gray-800">
                  Thinking...
                </div>
              </div>
            )}
            {error && (
              <div className="mb-3 text-left">
                <div className="text-xs text-red-600">
                  Error: {typeof error === 'string' ? error : 
                         error?.message ? error.message : 
                         'Failed to get response'}
                </div>
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
            <h3 className="text-sm font-medium">Activity Log</h3>
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
              No activity logged yet
            </div>
          ) : (
            <div className="border rounded-md overflow-hidden">
              {logEntries.map((entry, index) => (
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
                        {/* Extract just the text content for display, preserving full data in database */}
                        {entry.inputMessage ? extractTextFromParts(entry.inputMessage) : formatContent(entry.input)}
                      </div>
                    </div>
                    
                    <div>
                      <div className="text-xs font-medium mb-1">Output:</div>
                      <div className="text-xs overflow-auto max-h-20 whitespace-pre-wrap bg-gray-100 p-1 rounded">
                        {/* Extract just the text content for display, preserving full data in database */}
                        {entry.outputMessage ? extractTextFromParts(entry.outputMessage) : entry.output ? formatContent(entry.output) : 'No output'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
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

// Format input/output for display using enhanced message format
const formatContent = (content: string | Record<string, unknown> | AnyMessagePart[]): string => {
  try {
    // Special handling for string that might be JSON array of message parts
    if (typeof content === 'string' && content.trim().startsWith('[{') && 
        content.includes('"type"') && content.includes('"text"')) {
      // Try direct formatting first
      return formatMessageParts(content);
    }
    
    // Handle AnyMessagePart[] directly
    if (Array.isArray(content) && content.length > 0 && 'type' in content[0]) {
      return extractTextFromParts(content as AnyMessagePart[]);
    }
    
    // Default approach: convert to message parts, then format
    const messageParts = toMessageParts(content);
    return formatMessageParts(messageParts);
  } catch (e) {
    console.error('Error formatting content:', e);
    // Fallback to simple stringification
    return typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  }
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

// Process message content for display
const renderMessageContent = (content: string, role: string): string => {
  // Only process assistant messages
  if (role !== 'assistant') return content;
  
  try {
    // Check if the content is JSON format
    if (content.startsWith('[{') || content.startsWith('{')) {
      const parsed = JSON.parse(content);
      
      // Handle array format: [{"type":"text","text":"content"}]
      if (Array.isArray(parsed) && parsed[0]?.type === 'text' && 'text' in parsed[0]) {
        // Remove "Output: " prefix if present
        let text = parsed[0].text;
        if (text.startsWith('Output: ')) {
          text = text.substring(8);
        }
        // Remove extra quotes if present
        if (text.startsWith('"') && text.endsWith('"')) {
          text = text.substring(1, text.length - 1);
        }
        return text;
      } 
      // Handle single object format: {"type":"text","text":"content"}
      else if (parsed?.type === 'text' && 'text' in parsed) {
        // Remove "Output: " prefix if present
        let text = parsed.text;
        if (text.startsWith('Output: ')) {
          text = text.substring(8);
        }
        // Remove extra quotes if present
        if (text.startsWith('"') && text.endsWith('"')) {
          text = text.substring(1, text.length - 1);
        }
        return text;
      }
    }
    
    // Handle plain text with "Output:" prefix
    if (content.startsWith('Output: ')) {
      return content.substring(8);
    }
    
    // Return content as-is if no special handling needed
    return content;
  } catch (e) {
    console.warn('Error parsing message content:', e);
    return content;
  }
};
