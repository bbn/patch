import { GearInput, GearOutput, AnyMessagePart, Message } from "../types";

export interface ExampleInput {
  id: string;
  name: string;
  input: GearInput;
  output?: GearOutput;
  lastProcessed?: number;
}

export interface GearSource {
  id: string;
  label: string;
}

export interface GearLogEntry {
  timestamp: number;
  input: GearInput;
  output?: GearOutput;
  source?: GearSource | string;
  // Optional fields for the enhanced message format
  inputMessage?: AnyMessagePart[];
  outputMessage?: AnyMessagePart[];
}

export interface GearData {
  id: string;
  outputUrls: string[];
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  inputs?: Record<string, GearInput>;
  output?: GearOutput;
  exampleInputs?: ExampleInput[];
  label?: string;
  log?: GearLogEntry[];
  patchId?: string; // The ID of the patch this gear belongs to
  nodeId?: string;  // The ID of the node in the patch this gear corresponds to
  position?: { x: number; y: number }; // Position in the ReactFlow canvas
  isProcessing?: boolean; // Flag to indicate if the gear is currently processing
}