export interface PatchNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    gearId: string;
    label: string;
    isProcessing?: boolean;
  };
}

export interface PatchEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface PatchData {
  id: string;
  name: string;
  description?: string;
  nodes: PatchNode[];
  edges: PatchEdge[];
  createdAt: number;
  updatedAt: number;
}