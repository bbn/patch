import { uploadBlob } from '@/packages/outlets/blob';
import { put } from '@vercel/blob';

jest.mock('@vercel/blob', () => ({
  put: jest.fn()
}));

describe('blob outlet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadBlob', () => {
    it('uploads blob with default settings', async () => {
      const mockResult = { url: 'https://blob.vercel-storage.com/foo.txt' };
      (put as jest.Mock).mockResolvedValue(mockResult);

      const result = await uploadBlob({
        path: 'foo.txt',
        content: 'hi'
      });

      expect(put).toHaveBeenCalledWith(
        'foo.txt',
        'hi',
        {
          access: 'public',
          contentType: 'text/plain'
        }
      );

      expect(result).toEqual({
        url: 'https://blob.vercel-storage.com/foo.txt',
        size: 2
      });
    });

    it('uses custom bucket and content type', async () => {
      const mockResult = { url: 'https://blob.vercel-storage.com/data.json' };
      (put as jest.Mock).mockResolvedValue(mockResult);

      const result = await uploadBlob({
        bucket: 'custom-bucket',
        path: 'data.json',
        content: '{"test": true}',
        contentType: 'application/json'
      });

      expect(put).toHaveBeenCalledWith(
        'data.json',
        '{"test": true}',
        {
          access: 'public',
          contentType: 'application/json'
        }
      );

      expect(result).toEqual({
        url: 'https://blob.vercel-storage.com/data.json',
        size: 14
      });
    });

    it('uses environment variable for bucket when not specified', async () => {
      const originalEnv = process.env.VERCEL_BLOB_BUCKET;
      process.env.VERCEL_BLOB_BUCKET = 'env-bucket';

      const mockResult = { url: 'https://blob.vercel-storage.com/test.txt' };
      (put as jest.Mock).mockResolvedValue(mockResult);

      await uploadBlob({
        path: 'test.txt',
        content: 'test'
      });

      expect(put).toHaveBeenCalled();
      
      process.env.VERCEL_BLOB_BUCKET = originalEnv;
    });

    it('throws error on upload failure', async () => {
      (put as jest.Mock).mockRejectedValue(new Error('Upload failed'));

      await expect(uploadBlob({
        path: 'fail.txt',
        content: 'content'
      })).rejects.toThrow('Failed to upload blob to fail.txt: Upload failed');
    });

    it('handles non-Error objects', async () => {
      (put as jest.Mock).mockRejectedValue('String error');

      await expect(uploadBlob({
        path: 'fail.txt',
        content: 'content'
      })).rejects.toThrow('Failed to upload blob to fail.txt: String error');
    });
  });
});