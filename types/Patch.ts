import { Node } from './Node';

export interface PatchEdge {
  source: string;
  target: string;
}

export interface PatchDefinition {
  nodes: Node[];
  edges: PatchEdge[];
}
