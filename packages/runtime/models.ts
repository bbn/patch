// Data models for Patch runtime

import { z } from 'zod';

/** Log levels for runtime logging */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Describes a single port on a gear template.
 */
export interface GearPort {
  /** Unique port identifier */
  id: string;
  /** Human friendly name */
  name: string;
  /** Data type description */
  dataType: string;
}

/**
 * Test case used to validate a gear template.
 */
export interface GearTestCase {
  /** Input payload */
  input: unknown;
  /** Expected output */
  expectedOutput: unknown;
  /** Optional notes describing this test */
  notes?: string;
}

/** Options controlling logging behaviour */
export interface LoggingOptions {
  /** Minimum log level */
  level: LogLevel;
  /** Optional flag to redact sensitive info */
  redact?: boolean;
  /** Optional sample rate between 0 and 1 */
  sampleRate?: number;
}

/**
 * Reusable template defining a gear's behaviour and configuration.
 */
export interface GearTemplate {
  /** Unique template identifier */
  id: string;
  /** Template name */
  name: string;
  /** Semantic version string */
  version: string;
  /** Template author's name */
  author: string;
  /** Short description */
  description?: string;
  /** Markdown documentation */
  docsMarkdown?: string;
  /** Zod schema defining configuration shape */
  configSchema: z.ZodTypeAny;
  /** Default configuration object */
  defaultConfig: unknown;
  /** Input port definitions */
  inputPorts: GearPort[];
  /** Output port definitions */
  outputPorts: GearPort[];
  /** Default model identifier, if any */
  defaultModel?: string;
  /** Allowed external MCP server URLs */
  mcpServers?: string[];
  /** Unit test cases */
  testCases?: GearTestCase[];
  /** Logging options for this template */
  loggingOptions?: LoggingOptions;
}

/**
 * Instance of a gear template inside a patch graph.
 */
export interface GearInstance {
  /** Unique instance identifier */
  id: string;
  /** Reference to the underlying template */
  templateId: string;
  /** Optional custom name */
  name?: string;
  /** User provided configuration overrides */
  config?: unknown;
  /** Optional logging settings */
  loggingOptions?: LoggingOptions;
}

/**
 * Edge connecting two gear instances.
 */
export interface PatchEdge {
  /** Source gear instance id */
  source: string;
  /** Target gear instance id */
  target: string;
}

export interface PatchRun {
  /** Run status */
  status: 'running' | 'succeeded' | 'failed';
  /** Start timestamp */
  startedAt: number;
  /** Duration in milliseconds */
  duration: number;
  /** Arbitrary cost summary */
  costSummary?: unknown;
}

/**
 * Represents a patch graph composed of gear instances.
 */
export interface Patch {
  /** Patch identifier */
  id: string;
  /** Patch name */
  name: string;
  /** Optional description */
  description?: string;
  /** Gear instances */
  nodes: GearInstance[];
  /** Directed edges */
  edges: PatchEdge[];
  /** Patch inlet ids */
  inletIds: string[];
  /** Patch outlet ids */
  outletIds: string[];
  /** Logging settings for the patch */
  loggingOptions?: LoggingOptions;
  /** History of patch runs */
  runHistory?: PatchRun[];
}

// ------------------- Zod Schemas -------------------

export const GearPortSchema = z.object({
  id: z.string(),
  name: z.string(),
  dataType: z.string(),
});

export const GearTestCaseSchema = z.object({
  input: z.any(),
  expectedOutput: z.any(),
  notes: z.string().optional(),
});

export const LoggingOptionsSchema = z.object({
  level: z.union([z.literal('debug'), z.literal('info'), z.literal('warn'), z.literal('error')]),
  redact: z.boolean().optional(),
  sampleRate: z.number().min(0).max(1).optional(),
});

export const GearTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  author: z.string(),
  description: z.string().optional(),
  docsMarkdown: z.string().optional(),
  configSchema: z.any(),
  defaultConfig: z.any(),
  inputPorts: z.array(GearPortSchema),
  outputPorts: z.array(GearPortSchema),
  defaultModel: z.string().optional(),
  mcpServers: z.array(z.string()).optional(),
  testCases: z.array(GearTestCaseSchema).optional(),
  loggingOptions: LoggingOptionsSchema.optional(),
});

export const GearInstanceSchema = z.object({
  id: z.string(),
  templateId: z.string(),
  name: z.string().optional(),
  config: z.any().optional(),
  loggingOptions: LoggingOptionsSchema.optional(),
});

export const PatchEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
});

export const PatchRunSchema = z.object({
  status: z.union([z.literal('running'), z.literal('succeeded'), z.literal('failed')]),
  startedAt: z.number(),
  duration: z.number(),
  costSummary: z.any().optional(),
});

export const PatchSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  nodes: z.array(GearInstanceSchema),
  edges: z.array(PatchEdgeSchema),
  inletIds: z.array(z.string()),
  outletIds: z.array(z.string()),
  loggingOptions: LoggingOptionsSchema.optional(),
  runHistory: z.array(PatchRunSchema).optional(),
});
