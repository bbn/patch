import { put } from '@vercel/blob';

export interface BlobUploadOptions {
  bucket?: string;
  path: string;
  content: string;
  contentType?: string;
}

export interface BlobUploadResult {
  url: string;
  size: number;
}

export async function uploadBlob(opts: BlobUploadOptions): Promise<BlobUploadResult> {
  try {
    const bucket = opts.bucket || process.env.VERCEL_BLOB_BUCKET || 'patch-uploads';
    
    const result = await put(opts.path, opts.content, {
      access: 'public' as const,
      contentType: opts.contentType || 'text/plain'
    });

    return {
      url: result.url,
      size: new Blob([opts.content]).size
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to upload blob to ${opts.path}: ${message}`);
  }
}