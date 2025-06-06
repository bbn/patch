export const localFns: Record<string, (input: any) => any | Promise<any>> = {};

export function registerLocalFn(name: string, fn: (input: any) => any | Promise<any>): void {
  localFns[name] = fn;
}
