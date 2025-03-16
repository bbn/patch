export type Role = "user" | "assistant" | "system";

// Basic Message Interface (legacy format)
export interface Message {
  id?: string;
  role: Role;
  content: string;
}

// Enhanced message parts for structured content
export type MessagePartType = "text" | "json" | "code" | "tool_call" | "tool_result";

// Base message part interface
export interface MessagePart {
  type: MessagePartType;
  id?: string;
}

// Text content part
export interface TextPart extends MessagePart {
  type: "text";
  text: string;
}

// JSON data part
export interface JsonPart extends MessagePart {
  type: "json";
  data: Record<string, unknown>;
}

// Code block part
export interface CodePart extends MessagePart {
  type: "code";
  code: string;
  language?: string;
}

// Tool call part
export interface ToolCallPart extends MessagePart {
  type: "tool_call";
  name: string;
  parameters: Record<string, unknown>;
  id: string;
}

// Tool result part
export interface ToolResultPart extends MessagePart {
  type: "tool_result";
  call_id: string;
  result: unknown;
}

// Union type for all message parts
export type AnyMessagePart = TextPart | JsonPart | CodePart | ToolCallPart | ToolResultPart;

// Enhanced message interface with structured content
export interface GearMessage {
  id?: string;
  role: Role;
  timestamp?: number;
  content: string | AnyMessagePart[];
}

// Define a type for gear input/output data
export type GearInput = string | Record<string, unknown>;
export type GearOutput = string | Record<string, unknown> | AnyMessagePart[];