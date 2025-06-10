import { runPatch } from '@/packages/runtime/runPatch';
import { logError, logWarning } from '@/lib/logger';
import { PatchDefinition } from '@/types/Patch';
import demo from '@/patches/demo-simple.json';

// TODO: Replace with actual patch loading from database
async function loadPatch(patchId: string): Promise<PatchDefinition> {
  if (patchId === 'demo-simple') {
    return demo as PatchDefinition;
  }

  // Mock patch definition for now
  return {
    nodes: [{ id: 'test-node', kind: 'local' as const, fn: 'echo' }],
    edges: []
  };
}

function generatorToStream<T>(gen: AsyncGenerator<T>) {
  return new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await gen.next();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(`data: ${JSON.stringify(value)}\n\n`);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logError('inlet-route', `Error in patch execution stream: ${errorMessage}`, err);
        
        controller.enqueue(
          `event: error\ndata: ${JSON.stringify({
            error: 'PATCH_EXECUTION_FAILED',
            message: 'Patch execution failed',
            timestamp: Date.now()
          })}\n\n`
        );
        controller.close();
      }
    },
  });
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // Input validation for patch ID
  if (!params.id || typeof params.id !== 'string' || params.id.trim() === '') {
    logWarning('inlet-route', `Invalid patch ID provided: ${params.id}`);
    return new Response('Invalid patch ID', { status: 400 });
  }

  // TODO: configure CORS headers if web UI runs on a different origin

  // Parse and validate JSON payload
  let payload: unknown;
  try {
    payload = await req.json();
  } catch (err) {
    logWarning('inlet-route', `Invalid JSON payload: ${err instanceof Error ? err.message : String(err)}`);
    return new Response('Invalid JSON payload', { status: 400 });
  }

  let gen: AsyncGenerator<unknown>;
  try {
    const patch = await loadPatch(params.id);
    gen = runPatch(patch, payload);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logError('inlet-route', `Failed to start patch execution for ${params.id}: ${errorMessage}`, err);
    
    const errorStream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          `event: error\ndata: ${JSON.stringify({
            error: 'PATCH_START_FAILED',
            message: 'Failed to start patch execution',
            timestamp: Date.now()
          })}\n\n`
        );
        controller.close();
      },
    });
    return new Response(errorStream, {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const stream = generatorToStream(gen);

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}
