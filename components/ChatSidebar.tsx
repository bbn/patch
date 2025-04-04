"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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

interface PromptSidebarProps {
  gearId: string;
  initialMessages: { id?: string; role: string; content: string }[];
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
  onSubmitPrompt: (prompt: string) => Promise<void>;
}

export const ChatSidebar: React.FC<PromptSidebarProps> = ({
  gearId,
  initialMessages,
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
  onSubmitPrompt,
}) => {
  const [activeTab, setActiveTab] = useState<'prompt' | 'examples' | 'log'>('prompt');
  const [promptInput, setPromptInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get the system message from initialMessages
  const systemMessage = initialMessages.find(msg => msg.role === 'system')?.content || '';

  const handlePromptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!promptInput.trim()) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      await onSubmitPrompt(promptInput);
      setPromptInput(''); // Clear input after successful submission
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process prompt');
      console.error('Error processing prompt:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col text-sm">
      
      {/* Tabs */}
      <div className="p-2 border-b flex justify-center">
        <div className="flex">
          <Button
            variant={activeTab === 'prompt' ? 'default' : 'outline'}
            onClick={() => setActiveTab('prompt')}
            size="sm"
            className="rounded-r-none text-xs"
          >
            Prompt
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

      {/* Prompt Tab */}
      {activeTab === 'prompt' && (
        <div className="flex-grow flex flex-col p-3">
          <div className="mb-4">
            <h3 className="text-sm font-medium mb-2">System Instruction</h3>
            <div className="text-xs p-3 bg-gray-50 border rounded-md whitespace-pre-wrap">
              {systemMessage}
            </div>
          </div>
          
          <div className="flex-grow flex flex-col">
            <h3 className="text-sm font-medium mb-2">Input Prompt</h3>
            <form onSubmit={handlePromptSubmit} className="flex flex-col flex-grow">
              <Textarea
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                placeholder="Enter your input prompt..."
                className="flex-grow text-xs min-h-[100px] mb-2"
              />
              {error && (
                <div className="text-red-500 text-xs mb-2">
                  {error}
                </div>
              )}
              <Button 
                type="submit" 
                disabled={isLoading || !promptInput.trim()} 
                className="self-end"
              >
                {isLoading ? 'Processing...' : 'Process'}
              </Button>
            </form>
          </div>
        </div>
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
