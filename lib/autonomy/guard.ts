// HELIX Autonomy Switch — the guard. runAction() is the single choke point.

import type { AutonomyMode, Disposition, ProposedAction } from './types';

export function gate(mode: AutonomyMode): Disposition {
  switch (mode) {
    case 'advisor':
      return 'display';
    case 'approve':
      return 'enqueue';
    case 'autopilot':
      return 'execute';
  }
}

export interface ActionSinks<T> {
  display: (a: ProposedAction<T>) => Promise<unknown> | unknown;
  enqueue: (a: ProposedAction<T>) => Promise<unknown> | unknown;
  execute: (a: ProposedAction<T>) => Promise<unknown> | unknown;
}

export interface GateResult {
  mode: AutonomyMode;
  disposition: Disposition;
  result: unknown;
}

export async function runAction<T>(
  mode: AutonomyMode,
  action: ProposedAction<T>,
  sinks: ActionSinks<T>,
): Promise<GateResult> {
  const disposition = gate(mode);
  let result: unknown;
  if (disposition === 'display') result = await sinks.display(action);
  else if (disposition === 'enqueue') result = await sinks.enqueue(action);
  else result = await sinks.execute(action);
  return { mode, disposition, result };
}
