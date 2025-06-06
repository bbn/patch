import { randomUUID } from 'crypto';
import { PatchDefinition } from '../../types/Patch';
import { Node } from '../../types/Node';
import { topoSort } from './topoSort';
import { localFns } from './localFns';

export type PatchEvent =
  | { type: 'RunStart'; runId: string; ts: number }
  | { type: 'NodeStart'; nodeId: string; ts: number; input: any }
  | { type: 'NodeSuccess'; nodeId: string; ts: number; output: any }
  | { type: 'NodeError'; nodeId: string; ts: number; error: string }
  | { type: 'RunComplete'; runId: string; ts: number };

export async function* runPatch(
  patch: PatchDefinition,
  initialInput: any
): AsyncGenerator<PatchEvent> {
  const runId = randomUUID();
  yield { type: 'RunStart', runId, ts: Date.now() } as PatchEvent;

  const nodeMap = new Map<string, Node>();
  for (const node of patch.nodes) nodeMap.set(node.id, node);

  const order = topoSort(
    patch.nodes.map(n => n.id),
    patch.edges
  );

  const outputs = new Map<string, any>();

  for (const nodeId of order) {
    const node = nodeMap.get(nodeId)!;
    const incoming = patch.edges.filter(e => e.target === nodeId);
    let input: any;
    if (incoming.length === 0) {
      input = initialInput;
    } else if (incoming.length === 1) {
      input = outputs.get(incoming[0].source);
    } else {
      input = incoming.map(e => outputs.get(e.source));
    }

    yield { type: 'NodeStart', nodeId, ts: Date.now(), input } as PatchEvent;

    try {
      let output: any;
      if (node.kind === 'http') {
        const res = await fetch(node.url!, {
          method: 'POST',
          body: JSON.stringify(input),
        });
        output = await res.json();
      } else if (node.kind === 'local') {
        const fn = localFns[node.fn!];
        if (!fn) throw new Error(`Local function not found: ${node.fn}`);
        output = await fn(input);
      } else {
        throw new Error(`Unknown node kind: ${(node as any).kind}`);
      }
      outputs.set(nodeId, output);
      yield { type: 'NodeSuccess', nodeId, ts: Date.now(), output } as PatchEvent;
    } catch (err: any) {
      yield {
        type: 'NodeError',
        nodeId,
        ts: Date.now(),
        error: String(err),
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
