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
  onSendOutput?: (id: string, output: any) => Promise<void>;
}

export const ExampleInputPanel: React.FC<ExampleInputPanelProps> = ({
  gearId,
  examples,
  onAddExample,
  onUpdateExample,
  onDeleteExample,
  onProcessExample,
  onProcessAllExamples,
  onSendOutput,
}) => {
  const [newExampleName, setNewExampleName] = useState("");
  const [newExampleInput, setNewExampleInput] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isProcessing, setIsProcessing] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState<Record<string, boolean>>({});
  const [isSending, setIsSending] = useState<Record<string, boolean>>({});
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [unsavedChanges, setUnsavedChanges] = useState<Record<string, boolean>>({});
  
  // Initialize input values from examples
  useEffect(() => {
    const initialValues: Record<string, string> = {};
    
    // Map all example inputs to their string representations
    examples.forEach(example => {
      initialValues[example.id] = typeof example.input === 'string' 
        ? example.input 
        : JSON.stringify(example.input, null, 2);
    });
    
    // Update state
    setInputValues(initialValues);
    setUnsavedChanges({});
  }, [examples]);
  
  // Separate effect to handle processing state updates
  useEffect(() => {
    // Clear processing state for examples that have output
    const outputIds = examples
      .filter(example => example.output) // Find examples with output
      .map(example => example.id);       // Get just their IDs
      
    if (outputIds.length > 0) {
      setIsProcessing(prev => {
        const newState = {...prev};
        // Set processing to false for all examples with output
        outputIds.forEach(id => {
          newState[id] = false;
        });
        return newState;
      });
    }
  }, [examples]);

  const handleAddExample = async () => {
    if (!newExampleName.trim() || !newExampleInput.trim()) return;
    
    try {
      // Set creating state to show spinner
      setIsCreating(true);
      
      // Add the example first
      const exampleResult = await onAddExample(newExampleName, newExampleInput);
      
      // Reset form
      setNewExampleName("");
      setNewExampleInput("");
      
      // Set processing state for the new example
      const newExampleId = exampleResult?.id;
      if (newExampleId) {
        // Mark as processing immediately for better UX
        setIsProcessing(prev => ({ ...prev, [newExampleId]: true }));
        
        try {
          // Open the accordion item for the new example to show processing status
          setTimeout(() => {
            document.querySelector(`[data-state="closed"][value="${newExampleId}"]`)?.click();
          }, 100);
          
          // No need to call onProcessExample here if the parent component already processes it
          // The UI will update automatically via the Firestore subscription
        } catch (error) {
          console.error(`Error processing new example ${newExampleId}:`, error);
          // Reset processing state if there was an error
          setIsProcessing(prev => ({ ...prev, [newExampleId]: false }));
        }
      }
    } catch (error) {
      console.error("Error adding example:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleInputChange = (id: string, value: string) => {
    // Update the input value immediately and mark it as unsaved
    setInputValues(prev => ({ ...prev, [id]: value }));
    setUnsavedChanges(prev => ({ ...prev, [id]: true }));
  };
  
  const handleSaveExample = async (id: string) => {
    const example = examples.find(ex => ex.id === id);
    if (!example) return;
    
    setIsSaving(prev => ({ ...prev, [id]: true }));
    try {
      // First update the example
      await onUpdateExample(id, example.name, inputValues[id]);
      
      // Then process it
      await onProcessExample(id);
      
      // Clear the unsaved changes flag
      setUnsavedChanges(prev => ({ ...prev, [id]: false }));
    } catch (error) {
      console.error(`Error saving example ${id}:`, error);
    } finally {
      setIsSaving(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleProcessExample = async (id: string) => {
    // Don't process if there are unsaved changes
    if (unsavedChanges[id]) {
      return;
    }
    
    setIsProcessing(prev => ({ ...prev, [id]: true }));
    try {
      // Process the example but don't forward to connected gears
      await onProcessExample(id);
      
      // Keep the processing state true for a moment to ensure the UI reflects the processing
      // The state will be cleared when the examples array updates with the processed result
      setTimeout(() => {
        // Only clear the processing state if the example still doesn't have output after a delay
        setIsProcessing(prev => {
          // Find the example in the current examples array
          const currentExample = examples.find(ex => ex.id === id);
          if (currentExample && !currentExample.output) {
            // Still no output, keep processing state
            return prev;
          }
          // Clear processing state
          return { ...prev, [id]: false };
        });
      }, 2000);
    } catch (error) {
      console.error(`Error processing example ${id}:`, error);
      setIsProcessing(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleProcessAll = async () => {
    // Filter out examples with unsaved changes
    const examplesWithoutChanges = examples.filter(example => !unsavedChanges[example.id]);
    
    if (examplesWithoutChanges.length === 0) {
      return;
    }
    
    // Mark all examples as processing
    const processingAll = examplesWithoutChanges.reduce((acc, example) => {
      acc[example.id] = true;
      return acc;
    }, {} as Record<string, boolean>);
    
    setIsProcessing(prev => ({...prev, ...processingAll}));
    
    try {
      await onProcessAllExamples();
      
      // Keep the processing state true for a moment to ensure the UI reflects the processing
      setTimeout(() => {
        // Clear processing state for examples that have output
        setIsProcessing(prev => {
          const newState = {...prev};
          examples.forEach(example => {
            if (example.output) {
              newState[example.id] = false;
            }
          });
          return newState;
        });
      }, 2000);
    } catch (error) {
      console.error("Error processing all examples:", error);
      // Clear all processing states on error
      setIsProcessing({});
    }
  };

  const formatDateTime = (timestamp?: number) => {
    if (!timestamp) return "Never";
    return new Date(timestamp).toLocaleString();
  };

  const formatOutput = (output: any) => {
    // Handle empty/undefined values
    if (output === undefined || output === null) {
      return "No output available";
    }
    
    // Handle string outputs
    if (typeof output === 'string') {
      // Check if it's a JSON string
      try {
        // If it looks like JSON, try to parse and prettify it
        if ((output.trim().startsWith('{') && output.trim().endsWith('}')) || 
            (output.trim().startsWith('[') && output.trim().endsWith(']'))) {
          const parsed = JSON.parse(output);
          
          // Create a nicely formatted JSON string
          const formattedJson = JSON.stringify(parsed, null, 2);
          
          // Properly handle newlines that might be escaped in the JSON string values
          return formattedJson.replace(/\\\\n/g, '\n').replace(/\\n/g, '\n');
        }
      } catch (e) {
        // Not valid JSON, continue to process as a normal string
        console.log("Not valid JSON, treating as regular string");
      }
      
      // Replace escaped newlines with actual newlines if they exist
      // This happens when the API sends literal \n string instead of actual line breaks
      const processedOutput = output.replace(/\\n/g, '\n');
      
      // Return the processed string, preserving the exact LLM output but with proper line breaks
      return processedOutput;
    }
    
    // Handle objects/arrays by converting to formatted JSON
    try {
      // Convert to JSON with proper formatting
      const jsonString = JSON.stringify(output, null, 2);
      
      // Handle case where escaped newlines might be in string values within the JSON
      const processedJson = jsonString.replace(/\\\\n/g, '\n').replace(/\\n/g, '\n');
      
      return processedJson;
    } catch (e) {
      console.error("Error formatting output:", e);
      return `Error formatting output: ${String(output)}`;
    }
  };
  
  const handleSendOutput = async (id: string, output: any) => {
    if (!onSendOutput || !output) return;
    
    setIsSending(prev => ({ ...prev, [id]: true }));
    try {
      await onSendOutput(id, output);
    } catch (error) {
      console.error(`Error sending example output ${id}:`, error);
    } finally {
      setIsSending(prev => ({ ...prev, [id]: false }));
    }
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
            Object.values(isSaving).some(v => v) ||
            examples.some(ex => unsavedChanges[ex.id])
          }
          className="text-xs py-1 px-2 h-auto"
        >
          {Object.values(isProcessing).some(v => v) ? (
            <>
              <div className="w-4 h-4 mr-2 border-2 border-t-white border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
              Processing {Object.values(isProcessing).filter(v => v).length}/{examples.length}
            </>
          ) : "Process All"}
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
          disabled={!newExampleName.trim() || !newExampleInput.trim() || isCreating}
          className="text-xs py-1 px-2 h-7"
        >
          {isCreating ? (
            <>
              <div className="w-4 h-4 mr-2 border-2 border-t-white border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
              Creating...
            </>
          ) : "Add Example"}
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
                  <Button 
                  size="sm" 
                  onClick={() => handleSaveExample(example.id)}
                  disabled={!unsavedChanges[example.id] || isSaving[example.id] || isProcessing[example.id]}
                  className="text-xs py-0 px-2 h-6"
                >
                  {isSaving[example.id] ? (
                    <>
                      <span className="inline-block animate-spin mr-1">⟳</span>
                      Saving...
                    </>
                  ) : "Save"}
                </Button>
                  <Button 
                    size="sm" 
                    variant="destructive" 
                    onClick={() => onDeleteExample(example.id)}
                    disabled={isProcessing[example.id] || isSaving[example.id]}
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
                  
                  <div>
                      <h4 className="font-medium mb-1 text-xs">
                        Output <span className="text-xs text-gray-500">(Last processed: {formatDateTime(example.lastProcessed)})</span>:
                      </h4>
                      
                      {isProcessing[example.id] ? (
                        <div className="bg-gray-100 p-2 rounded-md flex items-center justify-center text-xs py-4">
                          <div className="flex flex-col items-center text-gray-600">
                            <div className="w-6 h-6 mb-2 border-2 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
                            <div>Processing example...</div>
                          </div>
                        </div>
                      ) : example.output ? (
                        <>
                          <pre className="bg-gray-100 p-2 rounded-md overflow-x-auto text-xs whitespace-pre-wrap break-words">
                            {formatOutput(example.output)}
                          </pre>
                          {onSendOutput && (
                            <Button 
                              size="sm"
                              className="w-full mt-2 text-xs h-7"
                              onClick={() => handleSendOutput(example.id, example.output)}
                              disabled={isSending[example.id] || !example.output}
                            >
                              {isSending[example.id] ? (
                                <>
                                  <span className="inline-block animate-spin mr-1">⟳</span>
                                  Sending...
                                </>
                              ) : "Send Output"}
                            </Button>
                          )}
                        </>
                      ) : (
                        <div className="bg-gray-100 p-2 rounded-md text-xs text-gray-500">
                          <>
                            No output yet. Click <button 
                              className="text-blue-500 hover:underline" 
                              onClick={() => handleProcessExample(example.id)}
                              disabled={unsavedChanges[example.id]}
                            >
                              Process
                            </button> to generate output.
                          </>
                        </div>
                      )}
                    </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
};