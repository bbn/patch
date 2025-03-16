import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { AnyMessagePart, TextPart, JsonPart, GearInput, GearOutput } from './models/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Debug logging helper - controls verbose logging throughout the application
// Can be controlled via environment variable (DEBUG_LOGGING=true)
export function isDebugLoggingEnabled(): boolean {
  return process.env.DEBUG_LOGGING === 'true';
}

// Conditional logging function - only logs if debug mode is enabled
export function debugLog(context: string, ...args: any[]): void {
  if (isDebugLoggingEnabled()) {
    console.log(`[DEBUG:${context}]`, ...args);
  }
}

/**
 * Converts any input to a structured message part array
 * @param content The content to convert
 * @returns An array of message parts
 */
export function toMessageParts(content: GearInput | GearOutput): AnyMessagePart[] {
  // If it's already an array of message parts, return it
  if (Array.isArray(content) && content.length > 0 && 'type' in content[0]) {
    return content as AnyMessagePart[];
  }

  // If it's a string, check if it's a JSON string of message parts
  if (typeof content === 'string') {
    try {
      // Check if it looks like a JSON array with message parts
      if (content.trim().startsWith('[{') && content.includes('"type"')) {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed) && parsed.length > 0 && 'type' in parsed[0]) {
          // Found array of message parts in string format
          return parsed.map(part => {
            if (part.type === 'text' && typeof part.text === 'string') {
              return { type: 'text', text: part.text };
            }
            return part;
          });
        }
      }
    } catch (e) {
      // If parsing failed, proceed with normal text part
      console.log("Failed to parse potential JSON message parts", e);
    }
    
    // Default: treat as plain text
    return [{ type: 'text', text: content }];
  }

  // If it's an object, convert to a JSON part
  if (typeof content === 'object' && content !== null) {
    // Check if it's a special format like Vercel AI SDK
    if ('type' in content && content.type === 'text' && 'text' in content) {
      return [{ type: 'text', text: content.text as string }];
    }
    
    // Otherwise treat as JSON data
    return [{ type: 'json', data: content as Record<string, unknown> }];
  }

  // Fallback for any other type
  return [{ type: 'text', text: String(content) }];
}

/**
 * Formats message parts into a displayable string
 * @param parts The message parts to format
 * @returns A formatted string for display
 */
/**
 * Extracts plain text from message parts
 * @param parts Array of message parts
 * @returns Just the text content joined with newlines
 */
export function extractTextFromParts(parts: AnyMessagePart[] | null | undefined): string {
  if (!parts || parts.length === 0) {
    return '';
  }
  
  // Get all text parts
  const textParts = parts
    .filter(part => part.type === 'text')
    .map(part => (part as TextPart).text);
  
  // If no text parts found but we have other parts, summarize them
  if (textParts.length === 0) {
    // Create summaries for non-text parts
    return parts.map(part => {
      switch (part.type) {
        case 'json':
          return '[JSON Data]';
        case 'code':
          return `[Code: ${(part as any).language || 'unknown'}]`;
        case 'tool_call':
          return `[Tool Call: ${(part as any).name || 'unknown'}]`;
        case 'tool_result':
          return '[Tool Result]';
        default:
          return `[${part.type || 'unknown'}]`;
      }
    }).join('\n');
  }
  
  // Join all text parts with newlines
  return textParts.join('\n');
}

export function formatMessageParts(parts: AnyMessagePart[] | string | Record<string, unknown>): string {
  // Handle string directly, but also check if it's a stringified message part array
  if (typeof parts === 'string') {
    try {
      // Check if it looks like a JSON array with message parts
      if (parts.trim().startsWith('[{') && parts.includes('"type"')) {
        const parsed = JSON.parse(parts);
        if (Array.isArray(parsed) && parsed.length > 0 && 'type' in parsed[0]) {
          // Parse the string back to message parts and format them
          return formatMessageParts(parsed);
        }
      }
    } catch (e) {
      // If parsing failed, use the original string
    }
    return parts;
  }

  // Handle object (non-array) - more readable format
  if (typeof parts === 'object' && parts !== null && !Array.isArray(parts)) {
    try {
      // Try to extract a 'text' property first if it exists
      if ('text' in parts && typeof parts.text === 'string') {
        return parts.text;
      }
      
      // Try to extract a 'content' property if it exists
      if ('content' in parts && typeof parts.content === 'string') {
        return parts.content;
      }
      
      // Fall back to full JSON
      return JSON.stringify(parts, null, 2);
    } catch (e) {
      return JSON.stringify(parts, null, 2);
    }
  }

  // Handle array of message parts
  if (Array.isArray(parts) && parts.length > 0 && 'type' in parts[0]) {
    // Join all text parts and summarize other parts
    const formattedParts = parts.map(part => {
      switch (part.type) {
        case 'text':
          return (part as TextPart).text;
        case 'json':
          try {
            const data = (part as JsonPart).data;
            // Check for known patterns to make display more readable
            if ('text' in data && typeof data.text === 'string') {
              return data.text;
            }
            if ('content' in data && typeof data.content === 'string') {
              return data.content;
            }
            // Format as compact JSON with important keys highlighted
            return JSON.stringify(data, null, 2);
          } catch (e) {
            return JSON.stringify((part as JsonPart).data, null, 2);
          }
        case 'code':
          return `\`\`\`${(part as any).language || ''}\n${(part as any).code}\n\`\`\``;
        case 'tool_call':
          return `[Tool Call: ${(part as any).name}]`;
        case 'tool_result':
          return `[Tool Result]`;
        default:
          return `[Unknown Part Type: ${(part as any).type || 'undefined'}]`;
      }
    }).join('\n\n');

    return formattedParts;
  }

  // Fallback for any other type
  return JSON.stringify(parts, null, 2);
}