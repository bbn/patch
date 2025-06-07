export interface BlobOutletConfig {
  bucket?: string;
  path: string;
  contentType?: string;
  metadata?: Record<string, unknown>;
}

export interface RevalidateOutletConfig {
  paths: string[];
  tags?: string[];
}

export interface SlackOutletConfig {
  webhook: string;
  channel?: string;
  template: string;
  attachments?: boolean;
}

export interface WebhookOutletConfig {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH';
  headers?: Record<string, string>;
  timeout?: number;
}

export interface EmailOutletConfig {
  to: string | string[];
  subject: string;
  template: string;
  from?: string;
}

export type OutletConfig = 
  | BlobOutletConfig
  | RevalidateOutletConfig 
  | SlackOutletConfig
  | WebhookOutletConfig
  | EmailOutletConfig;

export interface OutletNode {
  id: string;
  kind: 'outlet';
  variant: 'blob' | 'revalidate' | 'slack' | 'webhook' | 'email';
  config: OutletConfig;
  inputMapping?: Record<string, string>;
}