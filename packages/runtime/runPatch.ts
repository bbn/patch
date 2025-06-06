import { randomUUID } from 'crypto';
import { PatchDefinition } from '../../types/Patch';
import { Node } from '../../types/Node';
import { topoSort } from './topoSort';
import { localFns } from './localFns';
import { validateHttpUrl, createTimeoutController } from './security';

export type PatchEvent =
  | { type: 'RunStart'; runId: string; ts: number }
  | { type: 'NodeStart'; nodeId: string; ts: number; input: unknown }
  | {
      type: 'NodeSuccess';
      nodeId: string;
      ts: number;
      output: unknown;
    }
  | {
      type: 'NodeError';
      nodeId: string;
      ts: number;
      error: { message: string; stack?: string };
    }
  | { type: 'RunComplete'; runId: string; ts: number };

export async function* runPatch(
  patch: PatchDefinition,
  initialInput: unknown
): AsyncGenerator<PatchEvent> {
  const runId = randomUUID();
  yield { type: 'RunStart', runId, ts: Date.now() } as PatchEvent;

  if (!Array.isArray(patch.nodes) || !Array.isArray(patch.edges)) {
    throw new Error('Invalid patch definition');
  }

  const nodeMap = new Map<string, Node>();
  for (const node of patch.nodes) {
    if (nodeMap.has(node.id)) {
      throw new Error(`Duplicate node id: ${node.id}`);
    }
    nodeMap.set(node.id, node);
  }

  for (const edge of patch.edges) {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
      throw new Error(`Edge references unknown node: ${edge.source} -> ${edge.target}`);
    }
  }

  const order = topoSort(
    patch.nodes.map(n => n.id),
    patch.edges
  );

  const outputs = new Map<string, unknown>();

  for (const nodeId of order) {
    const node = nodeMap.get(nodeId)!;
    const incoming = patch.edges.filter(e => e.target === nodeId);
    let input: unknown;
    if (incoming.length === 0) {
      input = initialInput;
    } else if (incoming.length === 1) {
      input = outputs.get(incoming[0].source);
    } else {
      input = incoming.map(e => outputs.get(e.source));
    }

    yield { type: 'NodeStart', nodeId, ts: Date.now(), input } as PatchEvent;

    try {
      let output: unknown;
      if (node.kind === 'http') {
        // Validate URL for security (SSRF protection)
        validateHttpUrl(node.url);
        
        // Create timeout controller (30 second default)
        const controller = createTimeoutController(30000);
        
        try {
          const res = await fetch(node.url, {
            method: 'POST',
            body: JSON.stringify(input),
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          });
          
          // Check HTTP response status
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          }
          
          output = await res.json();
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            throw new Error('HTTP request timed out after 30 seconds');
          }
          throw err; // Re-throw original error
        }
      } else if (node.kind === 'local') {
        // Validate that function name is provided
        if (!node.fn) {
          throw new Error('Local node missing function name');
        }
        
        const fn = localFns[node.fn];
        if (!fn) {
          throw new Error(`Local function not found: ${node.fn}`);
        }
        
        output = await fn(input);
      } else {
        const unknownKind = (node as { kind?: unknown }).kind;
        throw new Error(`Unknown node kind: ${String(unknownKind)}`);
      }
      outputs.set(nodeId, output);
      yield { type: 'NodeSuccess', nodeId, ts: Date.now(), output } as PatchEvent;
    } catch (err: unknown) {
      const errorObj =
        err instanceof Error ? { message: err.message, stack: err.stack } : { message: String(err) };
      yield {
        type: 'NodeError',
        nodeId,
        ts: Date.now(),
        error: errorObj,
      } as PatchEvent;
      yield { type: 'RunComplete', runId, ts: Date.now() } as PatchEvent;
      return;
    }
  }

  // TODO: Parallel execution of independent nodes
  // TODO: Streaming token-by-token output once nodes adopt SSE / chunked fetch
  // TODO: Pluggable rate-limiting / retries

  yield { type: 'RunComplete', runId, ts: Date.now() } as PatchEvent;
}
