"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Gear, GearLogEntry } from '@/lib/models/Gear';
import { AnyMessagePart } from '@/lib/models/types';
import { formatMessageParts, toMessageParts, extractTextFromParts } from '@/lib/utils';

// Augment the GearLogEntry type to include the new message fields
declare module '@/lib/models/Gear' {
  interface GearLogEntry {
    inputMessage?: AnyMessagePart[];
    outputMessage?: AnyMessagePart[];
  }
}

interface GearTesterProps {
  gearId: string;
}

export const GearTester: React.FC<GearTesterProps> = ({ gearId }) => {
  const [gear, setGear] = useState<Gear | null>(null);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [logEntries, setLogEntries] = useState<GearLogEntry[]>([]);

  // Load gear data and set up real-time updates
  useEffect(() => {
    if (!gearId) return;
    
    let unsubscribe: (() => void) | null = null;

    const loadGear = async () => {
      try {
        const loadedGear = await Gear.findById(gearId);
        
        if (loadedGear) {
          setGear(loadedGear);
          
          // If gear has output, show it
          if (loadedGear.output) {
            setOutput(loadedGear.output as string);
          }
          
          // Load log entries (always set to an array, even if empty)
          setLogEntries(loadedGear.log || []);
          
          // Set up real-time updates
          console.log(`Setting up real-time updates for gear ${gearId}`);
          unsubscribe = loadedGear.subscribeToUpdates((updatedGear) => {
            console.log(`Received real-time update for gear ${gearId}`);
            setGear(updatedGear);
            
            // Update output if it changed
            if (updatedGear.output) {
              setOutput(updatedGear.output as string);
            }
            
            // Always update log entries, ensuring it's an array
            const logEntries = updatedGear.log || [];
            console.log(`Updated log entries for gear ${gearId}: ${logEntries.length} entries`);
            
            // Always update log entries, even if empty, to ensure UI reflects current state
            setLogEntries(prevLogEntries => {
              const hasChanged = JSON.stringify(prevLogEntries) !== JSON.stringify(logEntries);
              console.log(`Log entries ${hasChanged ? 'CHANGED' : 'unchanged'} (current: ${prevLogEntries.length}, new: ${logEntries.length})`);
              return logEntries;
            });
          });
        }
      } catch (err) {
        console.error('Error loading gear:', err);
        setError('Failed to load gear data');
      }
    };

    loadGear();
    
    // Cleanup subscription on unmount
    return () => {
      if (unsubscribe) {
        console.log(`Cleaning up subscription for gear ${gearId}`);
        unsubscribe();
      }
    };
  }, [gearId]);

  const handleProcess = async () => {
    if (!gear) return;
    
    setLoading(true);
    setError('');
    
    try {
      // Use the direct API to process the input
      const response = await fetch(`/api/gears/${gearId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          source: 'user_input',
          message: input
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to process: ${errorText}`);
      }
      
      const result = await response.json();
      setOutput(result.output);
      
      // We don't need to reload the gear here since we have real-time updates
      // The subscription will handle updating the state when the log is updated
    } catch (err: any) {
      console.error('Error processing input:', err);
      setError(err.message || 'Failed to process input');
    } finally {
      setLoading(false);
    }
  };

  if (!gear) {
    return (
      <Card>
        <CardContent className="pt-6">
          {error ? (
            <p className="text-red-500">{error}</p>
          ) : (
            <p>Loading gear {gearId}...</p>
          )}
        </CardContent>
      </Card>
    );
  }

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
  const formatContent = (content: string | Record<string, unknown>): string => {
    try {
      // Special handling for string that might be JSON array of message parts
      if (typeof content === 'string' && content.trim().startsWith('[{') && 
          content.includes('"type"') && content.includes('"text"')) {
        // Try direct formatting first
        return formatMessageParts(content);
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

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Debug Gear {gearId}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-1">Input</label>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter input for this gear..."
              rows={4}
            />
          </div>
          
          {error && <p className="text-red-500">{error}</p>}
          
          {output && (
            <div>
              <label className="block text-sm font-medium mb-1">Output</label>
              <div className="border rounded-md p-2 bg-gray-50 min-h-[100px] whitespace-pre-wrap">
                {output}
              </div>
            </div>
          )}
          
          {/* Log Display with Debug Info */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-medium">Activity Log</h3>
              <div className="text-xs text-gray-500">Count: {logEntries.length}</div>
            </div>
            
            {logEntries.length === 0 ? (
              <div className="text-gray-500 text-sm p-4 text-center border rounded-md">
                No log entries found. 
                <br/>
                <span className="text-xs mt-1 block">Log entries will appear here when the gear processes inputs from other gears.</span>
              </div>
            ) : (
              <div className="border rounded-md overflow-hidden">
                {logEntries.map((entry, index) => (
                  <div 
                    key={`${entry.timestamp}-${index}`} 
                    className={`border-b last:border-b-0 p-3 ${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}
                  >
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <div>{typeof entry.source === 'object' ? entry.source.label : (entry.source || 'direct')}</div>
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
        </div>
      </CardContent>
      <CardFooter>
        <Button 
          onClick={handleProcess} 
          disabled={loading}
        >
          {loading ? 'Processing...' : 'Process Input'}
        </Button>
      </CardFooter>
    </Card>
  );
};