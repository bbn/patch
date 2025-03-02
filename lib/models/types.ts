export type Role = "user" | "assistant" | "system";

export interface Message {
  id?: string;
  role: Role;
  content: string;
}

// Define a type for gear input/output data
export type GearInput = string | Record<string, unknown>;
export type GearOutput = string | Record<string, unknown>;