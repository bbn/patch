"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Gear } from '@/lib/models/Gear';

interface GearTesterProps {
  gearId: string;
}

export const GearTester: React.FC<GearTesterProps> = ({ gearId }) => {
  const [gear, setGear] = useState<Gear | null>(null);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Debug Gear {gearId}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
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