import { useEffect, useCallback } from 'react';

interface GearStatusListenerProps {
  gearIds: string[];
  onStatusChange: (gearId: string, status: 'processing' | 'complete' | 'error') => void;
}

export function GearStatusListener({ gearIds, onStatusChange }: GearStatusListenerProps) {
  const subscribeToGear = useCallback((gearId: string) => {
    if (!gearId) return null;
    
    console.log(`Subscribing to status updates for gear ${gearId}`);
    const eventSource = new EventSource(`/api/gears/${gearId}/status`);
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === 'processing') {
          onStatusChange(gearId, 'processing');
        } else if (data.status === 'complete') {
          onStatusChange(gearId, 'complete');
        } else if (data.status === 'error') {
          onStatusChange(gearId, 'error');
        }
      } catch (error) {
        console.error(`Error processing gear status event:`, error);
      }
    };
    
    eventSource.onerror = () => {
      console.error(`EventSource connection error for gear ${gearId}`);
      eventSource.close();
      // Try to reconnect after a short delay
      setTimeout(() => subscribeToGear(gearId), 5000);
    };
    
    return eventSource;
  }, [onStatusChange]);
  
  useEffect(() => {
    // Skip if no gear IDs or running on server
    if (!gearIds.length || typeof window === 'undefined') return;
    
    // Create event sources for each gear
    const eventSources = gearIds.map(subscribeToGear).filter(Boolean);
    
    // Clean up function
    return () => {
      eventSources.forEach((es) => {
        if (es) es.close();
      });
    };
  }, [gearIds, subscribeToGear]);
  
  // This component doesn't render anything
  return null;
}