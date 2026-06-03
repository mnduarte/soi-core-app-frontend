import type { Appointment, AppointmentStatus } from '../api/appointments';

// Statuses that mean "this turno is closed; the time slot is resolved either way".
// Anything outside this set + a past endsAt = needs the user to decide.
export const TERMINAL_STATUSES: ReadonlySet<AppointmentStatus> = new Set([
  'COMPLETED',
  'NO_SHOW',
  'CANCELLED',
]);

export function isTerminal(a: Appointment): boolean {
  return TERMINAL_STATUSES.has(a.status);
}

// "Necesita resolución": the slot has passed but no one closed it yet.
// We split the lifecycles intentionally — the clock doesn't decide "atendido";
// it just flags "hey, this needs a manual call".
export function needsResolution(a: Appointment, now: Date = new Date()): boolean {
  if (isTerminal(a)) return false;
  return new Date(a.endsAt).getTime() <= now.getTime();
}

export function hhmm(iso: string): string {
  return new Date(iso).toTimeString().slice(0, 5);
}

export function durationMin(a: Appointment): number {
  return Math.round((new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()) / 60_000);
}

export function isFichaPending(a: Appointment): boolean {
  return a.status === 'COMPLETED' && a.ficha === 'PENDING';
}
