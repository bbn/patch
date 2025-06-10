export const localFns: Record<string, (input: unknown) => unknown | Promise<unknown>> = {};

export function registerLocalFn<Input = unknown, Output = unknown>(
  name: string,
  fn: (input: Input) => Output | Promise<Output>
): void {
  localFns[name] = fn as (input: unknown) => unknown | Promise<unknown>;
}

// Bootstrap built-in local functions
import { echoGear } from '@/packages/gears/echoGear';
import { revalidate } from '@/packages/outlets/revalidate';

registerLocalFn('echoGear', echoGear);
registerLocalFn('revalidate', async (input: unknown) => {
  // For demo purposes, simulate revalidation without calling Next.js revalidatePath
  // In a real application, this would call revalidatePath from within a proper request context
  console.log('Demo: would revalidate paths for input:', input);
  return 'done';
});
