export const localFns: Record<string, (input: unknown) => unknown | Promise<unknown>> = {};

export function registerLocalFn<Input = unknown, Output = unknown>(
  name: string,
  fn: (input: Input) => Output | Promise<Output>
): void {
  localFns[name] = fn as (input: unknown) => unknown | Promise<unknown>;
}

// Bootstrap built-in local functions
import { echoGear } from '@/packages/gears/echoGear';
registerLocalFn('echoGear', echoGear);
