import { revalidatePath } from 'next/cache';

export async function revalidate(paths: string[] | string): Promise<void> {
  try {
    const pathsArray = Array.isArray(paths) ? paths : [paths];
    pathsArray.forEach(path => revalidatePath(path));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to revalidate paths: ${message}`);
  }
}