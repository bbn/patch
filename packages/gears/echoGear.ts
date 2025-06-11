import type { GearContext } from '@/packages/runtime/types';

export async function echoGear(
  input: { msg: string },
  _ctx?: GearContext
) {
  return { echo: input.msg };
}
