import { NextRequest } from 'next/server';
import { getFromKV } from '@/lib/kv';

export const runtime = "edge";

// Map to track active connections per gear
const activeConnections = new Map<string, Set<ReadableStreamController<string>>>();

// Function to send event to all subscribers for a specific gear
export async function sendGearStatusEvent(gearId: string, status: string, data: any) {
  const connections = activeConnections.get(gearId);
  if (!connections) return;
  
  const eventData = JSON.stringify({ status, data });
  for (const controller of connections) {
    try {
      controller.enqueue(`data: ${eventData}\n\n`);
    } catch (e) {
      console.error(`Error sending to subscriber for gear ${gearId}:`, e);
    }
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gearId: string }> }
) {
  const resolvedParams = await params;
  const gearId = resolvedParams.gearId;
  
  console.log(`SSE connection established for gear ${gearId}`);
  
  // Create a streaming response
  const stream = new ReadableStream({
    start(controller) {
      // Store the connection
      if (!activeConnections.has(gearId)) {
        activeConnections.set(gearId, new Set());
      }
      
      activeConnections.get(gearId)!.add(controller);
      
      // Send initial connection event
      controller.enqueue(`data: ${JSON.stringify({ status: "connected" })}\n\n`);
      
      // Keep connection alive with regular pings
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(`: ping\n\n`);
        } catch (e) {
          clearInterval(pingInterval);
        }
      }, 30000);
      
      // Clean up on close
      return () => {
        clearInterval(pingInterval);
        const connections = activeConnections.get(gearId);
        if (connections) {
          connections.delete(controller);
          if (connections.size === 0) {
            activeConnections.delete(gearId);
          }
        }
      };
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}