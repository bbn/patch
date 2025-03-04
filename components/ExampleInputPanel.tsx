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
  const [editMode, setEditMode] = useState<Record<string, boolean>>({});
  const [editingName, setEditingName] = useState<Record<string, string>>({});
  const [editingInput, setEditingInput] = useState<Record<string, string>>({});
  const [isProcessing, setIsProcessing] = useState<Record<string, boolean>>({});

  const handleAddExample = async () => {
    if (!newExampleName.trim() || !newExampleInput.trim()) return;
    
    await onAddExample(newExampleName, newExampleInput);
    
    // Reset form
    setNewExampleName("");
    setNewExampleInput("");
  };

  const handleEditExample = (example: ExampleInput) => {
    setEditMode({ ...editMode, [example.id]: true });
    setEditingName({ ...editingName, [example.id]: example.name });
    setEditingInput({ 
      ...editingInput, 
      [example.id]: typeof example.input === 'string' 
        ? example.input 
        : JSON.stringify(example.input, null, 2) 
    });
  };

  const handleSaveEdit = async (id: string) => {
    await onUpdateExample(
      id, 
      editingName[id], 
      editingInput[id]
    );
    
    setEditMode({ ...editMode, [id]: false });
  };

  const handleCancelEdit = (id: string) => {
    setEditMode({ ...editMode, [id]: false });
  };

  const handleProcessExample = async (id: string) => {
    setIsProcessing({ ...isProcessing, [id]: true });
    try {
      await onProcessExample(id);
    } finally {
      setIsProcessing({ ...isProcessing, [id]: false });
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
                    variant="outline" 
                    onClick={() => handleEditExample(example)}
                    disabled={editMode[example.id] || isProcessing[example.id]}
                  >
                    Edit
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={() => handleProcessExample(example.id)}
                    disabled={editMode[example.id] || isProcessing[example.id]}
                  >
                    {isProcessing[example.id] ? "Processing..." : "Process"}
                  </Button>
                  <Button 
                    size="sm" 
                    variant="destructive" 
                    onClick={() => onDeleteExample(example.id)}
                    disabled={editMode[example.id] || isProcessing[example.id]}
                  >
                    Delete
                  </Button>
                </div>
              </div>
              
              <AccordionContent>
                {editMode[example.id] ? (
                  <div className="space-y-4 mt-4">
                    <Input
                      placeholder="Example name"
                      value={editingName[example.id]}
                      onChange={(e) => setEditingName({ ...editingName, [example.id]: e.target.value })}
                    />
                    <Textarea
                      placeholder="Input data (text or JSON)"
                      value={editingInput[example.id]}
                      onChange={(e) => setEditingInput({ ...editingInput, [example.id]: e.target.value })}
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <Button 
                        onClick={() => handleSaveEdit(example.id)}
                        disabled={!editingName[example.id]?.trim() || !editingInput[example.id]?.trim()}
                      >
                        Save
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={() => handleCancelEdit(example.id)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 mt-4">
                    <div>
                      <h4 className="font-medium mb-2">Input:</h4>
                      <pre className="bg-gray-100 p-3 rounded-md overflow-x-auto text-sm">
                        {typeof example.input === 'string' 
                          ? example.input 
                          : JSON.stringify(example.input, null, 2)}
                      </pre>
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
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
};