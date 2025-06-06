export interface HttpNode {
  id: string;
  kind: 'http';
  url: string;
}

export interface LocalNode {
  id: string;
  kind: 'local';
  fn: string;
}

export type Node = HttpNode | LocalNode;
