export interface Edge {
  source: string;
  target: string;
}

export function topoSort(nodes: string[], edges: Edge[]): string[] {
  const inDegree = new Map<string, number>();
  for (const id of nodes) inDegree.set(id, 0);
  for (const { source, target } of edges) {
    inDegree.set(target, (inDegree.get(target) || 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const e of edges) {
      if (e.source === id) {
        const deg = (inDegree.get(e.target) || 0) - 1;
        inDegree.set(e.target, deg);
        if (deg === 0) queue.push(e.target);
      }
    }
  }

  if (order.length !== nodes.length) {
    throw new Error('Cycle detected in patch graph');
  }

  return order;
}
