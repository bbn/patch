"use client";

import { useState, useEffect } from "react";
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
  const [unsavedChanges, setUnsavedChanges] = useState<Record<string, boolean>>({});
  
  // Initialize input values from examples
  useEffect(() => {
    const initialValues: Record<string, string> = {};
    examples.forEach(example => {
      initialValues[example.id] = typeof example.input === 'string' 
        ? example.input 
        : JSON.stringify(example.input, null, 2);
    });
    setInputValues(initialValues);
    setUnsavedChanges({});
  }, [examples]);

  const handleAddExample = async () => {
    if (!newExampleName.trim() || !newExampleInput.trim()) return;
    
    await onAddExample(newExampleName, newExampleInput);
    
    // Reset form
    setNewExampleName("");
    setNewExampleInput("");
  };

  const handleInputChange = (id: string, value: string) => {
    // Update the input value immediately and mark it as unsaved
    setInputValues(prev => ({ ...prev, [id]: value }));
    setUnsavedChanges(prev => ({ ...prev, [id]: true }));
  };
  
  const handleSaveExample = async (id: string) => {
    const example = examples.find(ex => ex.id === id);
    if (!example) return;
    
    try {
      await onUpdateExample(id, example.name, inputValues[id]);
      setUnsavedChanges(prev => ({ ...prev, [id]: false }));
    } catch (error) {
      console.error(`Error saving example ${id}:`, error);
    }
  };

  const handleProcessExample = async (id: string) => {
    // Don't process if there are unsaved changes
    if (unsavedChanges[id]) {
      return;
    }
    
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
    // Filter out examples with unsaved changes
    const examplesWithoutChanges = examples.filter(example => !unsavedChanges[example.id]);
    
    if (examplesWithoutChanges.length === 0) {
      return;
    }
    
    const processingAll = examplesWithoutChanges.reduce((acc, example) => {
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
    <div className="w-full h-full overflow-y-auto text-xs">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-medium">Example Inputs</h3>
        <Button 
          size="sm" 
          onClick={handleProcessAll}
          disabled={
            examples.length === 0 || 
            Object.values(isProcessing).some(v => v) ||
            examples.some(ex => unsavedChanges[ex.id])
          }
          className="text-xs py-1 px-2 h-auto"
        >
          Process All
        </Button>
      </div>
      {/* Add new example form */}
      <div className="space-y-2 mb-3 pb-3 border-b">
        <Input
          placeholder="Example name"
          value={newExampleName}
          onChange={(e) => setNewExampleName(e.target.value)}
          className="text-xs h-7"
        />
        <Textarea
          placeholder="Input data (text or JSON)"
          value={newExampleInput}
          onChange={(e) => setNewExampleInput(e.target.value)}
          rows={2}
          className="text-xs"
        />
        <Button 
          onClick={handleAddExample} 
          disabled={!newExampleName.trim() || !newExampleInput.trim()}
          className="text-xs py-1 px-2 h-7"
        >
          Add Example
        </Button>
      </div>

      {/* Example list */}
      {examples.length === 0 ? (
        <div className="text-center text-gray-500 my-2 text-xs">
          No examples added yet
        </div>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {examples.map((example) => (
            <AccordionItem key={example.id} value={example.id} className="border rounded-lg p-1">
              <div className="flex justify-between items-center">
                <AccordionTrigger className="hover:no-underline text-xs py-1">
                  {example.name}
                </AccordionTrigger>
                <div className="flex gap-1">
                  {unsavedChanges[example.id] ? (
                    <Button 
                      size="sm" 
                      onClick={() => handleSaveExample(example.id)}
                      disabled={isProcessing[example.id]}
                      className="text-xs py-0 px-2 h-6"
                    >
                      Save
                    </Button>
                  ) : (
                    <Button 
                      size="sm" 
                      onClick={() => handleProcessExample(example.id)}
                      disabled={isProcessing[example.id]}
                      className="text-xs py-0 px-2 h-6"
                    >
                      {isProcessing[example.id] ? "Processing..." : "Process"}
                    </Button>
                  )}
                  <Button 
                    size="sm" 
                    variant="destructive" 
                    onClick={() => onDeleteExample(example.id)}
                    disabled={isProcessing[example.id]}
                    className="text-xs py-0 px-2 h-6"
                  >
                    Delete
                  </Button>
                </div>
              </div>
              
              <AccordionContent>
                <div className="space-y-2 mt-2">
                  <div>
                    <h4 className="font-medium mb-1 text-xs">Input:</h4>
                    <Textarea
                      placeholder="Input data (text or JSON)"
                      value={inputValues[example.id] || ''}
                      onChange={(e) => handleInputChange(example.id, e.target.value)}
                      rows={2}
                      className="font-mono text-xs"
                    />
                  </div>
                  
                  {example.output && (
                    <div>
                      <h4 className="font-medium mb-1 text-xs">
                        Output <span className="text-xs text-gray-500">(Last processed: {formatDateTime(example.lastProcessed)})</span>:
                      </h4>
                      <pre className="bg-gray-100 p-2 rounded-md overflow-x-auto text-xs">
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