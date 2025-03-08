"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Gear, GearLogEntry } from '@/lib/models/Gear';

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

  // Load gear data
  useEffect(() => {
    if (!gearId) return;

    const loadGear = async () => {
      try {
        const loadedGear = await Gear.findById(gearId);
        setGear(loadedGear);
        
        // If gear has output, show it
        if (loadedGear?.output) {
          setOutput(loadedGear.output as string);
        }
        
        // Load log entries
        if (loadedGear?.log) {
          setLogEntries(loadedGear.log);
        }
      } catch (err) {
        console.error('Error loading gear:', err);
        setError('Failed to load gear data');
      }
    };

    loadGear();
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
      
      // Reload the gear to get updated state
      const updatedGear = await Gear.findById(gearId);
      setGear(updatedGear);
      
      // Update log entries
      if (updatedGear?.log) {
        setLogEntries(updatedGear.log);
      }
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
  
  // Format input/output for display
  const formatContent = (content: string | Record<string, unknown>): string => {
    if (typeof content === 'string') {
      return content;
    }
    return JSON.stringify(content, null, 2);
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
          
          {/* Log Display */}
          {logEntries.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2">Activity Log</h3>
              <div className="border rounded-md overflow-hidden">
                {logEntries.map((entry, index) => (
                  <div 
                    key={`${entry.timestamp}-${index}`} 
                    className={`border-b last:border-b-0 p-3 ${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}
                  >
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <div>{entry.source || 'direct'}</div>
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
                ))}
              </div>
            </div>
          )}
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