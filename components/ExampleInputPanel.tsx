"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
import { ExampleInput } from "@/lib/models/Gear";

// Debounce utility function
function useDebounce<T extends (...args: any[]) => Promise<void>>(
  callback: T,
  delay: number
) {
  const timerRef = useRef<number | null>(null);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }

      return new Promise<void>((resolve) => {
        timerRef.current = window.setTimeout(async () => {
          try {
            await callback(...args);
          } catch (err) {
            console.error("Error in debounced callback:", err);
          }
          resolve();
        }, delay);
      });
    },
    [callback, delay]
  );
}

interface ExampleInputPanelProps {
  gearId: string;
  examples: ExampleInput[];
  onAddExample: (name: string, input: string) => Promise<void>;
  onUpdateExample: (id: string, name: string, input: string) => Promise<void>;
  onDeleteExample: (id: string) => Promise<void>;
  onProcessExample: (id: string) => Promise<void>;
  onProcessAllExamples: () => Promise<void>;
}

export const ExampleInputPanel: React.FC<ExampleInputPanelProps> = ({
  gearId,
  examples,
  onAddExample,
  onUpdateExample,
  onDeleteExample,
  onProcessExample,
  onProcessAllExamples,
}) => {
  const [newExampleName, setNewExampleName] = useState("");
  const [newExampleInput, setNewExampleInput] = useState("");
  const [isProcessing, setIsProcessing] = useState<Record<string, boolean>>({});
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  
  // Initialize input values from examples
  useEffect(() => {
    const initialValues: Record<string, string> = {};
    examples.forEach(example => {
      initialValues[example.id] = typeof example.input === 'string' 
        ? example.input 
        : JSON.stringify(example.input, null, 2);
    });
    setInputValues(initialValues);
  }, [examples]);

  // Create debounced update function
  const debouncedUpdate = useDebounce(async (id: string, input: string) => {
    const example = examples.find(ex => ex.id === id);
    if (!example) return;
    
    await onUpdateExample(id, example.name, input);
    await onProcessExample(id);
  }, 750);

  const handleAddExample = async () => {
    if (!newExampleName.trim() || !newExampleInput.trim()) return;
    
    await onAddExample(newExampleName, newExampleInput);
    
    // Reset form
    setNewExampleName("");
    setNewExampleInput("");
  };

  const handleInputChange = (id: string, value: string) => {
    // Update the input value immediately
    setInputValues(prev => ({ ...prev, [id]: value }));
    
    // Use the debounced function to update and process
    try {
      debouncedUpdate(id, value).catch(err => {
        console.error("Error in debounced update:", err);
      });
    } catch (error) {
      console.error("Error initiating debounced update:", error);
    }
  };

  const handleProcessExample = async (id: string) => {
    setIsProcessing(prev => ({ ...prev, [id]: true }));
    try {
      await onProcessExample(id);
    } catch (error) {
      console.error(`Error processing example ${id}:`, error);
    } finally {
      setIsProcessing(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleProcessAll = async () => {
    const processingAll = examples.reduce((acc, example) => {
      acc[example.id] = true;
      return acc;
    }, {} as Record<string, boolean>);
    
    setIsProcessing(processingAll);
    
    try {
      await onProcessAllExamples();
    } catch (error) {
      console.error("Error processing all examples:", error);
    } finally {
      setIsProcessing({});
    }
  };

  const formatDateTime = (timestamp?: number) => {
    if (!timestamp) return "Never";
    return new Date(timestamp).toLocaleString();
  };

  const formatOutput = (output: any) => {
    if (typeof output === 'string') {
      return output;
    }
    return JSON.stringify(output, null, 2);
  };

  return (
    <div className="w-full h-full overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium">Example Inputs</h3>
        <Button 
          size="sm" 
          onClick={handleProcessAll}
          disabled={examples.length === 0 || Object.values(isProcessing).some(v => v)}
        >
          Process All
        </Button>
      </div>
      {/* Add new example form */}
      <div className="space-y-4 mb-6 pb-6 border-b">
        <Input
          placeholder="Example name"
          value={newExampleName}
          onChange={(e) => setNewExampleName(e.target.value)}
        />
        <Textarea
          placeholder="Input data (text or JSON)"
          value={newExampleInput}
          onChange={(e) => setNewExampleInput(e.target.value)}
          rows={3}
        />
        <Button onClick={handleAddExample} disabled={!newExampleName.trim() || !newExampleInput.trim()}>
          Add Example
        </Button>
      </div>

      {/* Example list */}
      {examples.length === 0 ? (
        <div className="text-center text-gray-500 my-4">
          No examples added yet
        </div>
      ) : (
        <Accordion type="multiple" className="space-y-4">
          {examples.map((example) => (
            <AccordionItem key={example.id} value={example.id} className="border rounded-lg p-2">
              <div className="flex justify-between items-center">
                <AccordionTrigger className="hover:no-underline">
                  {example.name}
                </AccordionTrigger>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    onClick={() => handleProcessExample(example.id)}
                    disabled={isProcessing[example.id]}
                  >
                    {isProcessing[example.id] ? "Processing..." : "Process"}
                  </Button>
                  <Button 
                    size="sm" 
                    variant="destructive" 
                    onClick={() => onDeleteExample(example.id)}
                    disabled={isProcessing[example.id]}
                  >
                    Delete
                  </Button>
                </div>
              </div>
              
              <AccordionContent>
                <div className="space-y-4 mt-4">
                  <div>
                    <h4 className="font-medium mb-2">Input:</h4>
                    <Textarea
                      placeholder="Input data (text or JSON)"
                      value={inputValues[example.id] || ''}
                      onChange={(e) => handleInputChange(example.id, e.target.value)}
                      rows={3}
                      className="font-mono text-sm"
                    />
                  </div>
                  
                  {example.output && (
                    <div>
                      <h4 className="font-medium mb-2">
                        Output <span className="text-xs text-gray-500">(Last processed: {formatDateTime(example.lastProcessed)})</span>:
                      </h4>
                      <pre className="bg-gray-100 p-3 rounded-md overflow-x-auto text-sm">
                        {formatOutput(example.output)}
                      </pre>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
};