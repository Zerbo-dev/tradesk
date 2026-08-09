import type { Window } from "./types";

/**
 * 3 créneaux / jour, en UTC (aligné avec `nowGmt()` de smc/format.ts qui
 * affiche déjà les heures en GMT+0 dans les messages Telegram existants).
 */
const RAW_WINDOWS: { label: string; startH: number; endH: number }[] = [
  { label: "00:00-03:00", startH: 0, endH: 3 },
  { label: "09:00-11:00", startH: 9, endH: 11 },
  { label: "13:00-17:00", startH: 13, endH: 17 },
];

/**
 * Le cron tourne sur une grille `*\/15 * * * *` → un créneau se ferme sur
 * son dernier tick programmé, càd la dernière minute :00/:15/:30/:45 avant la fin.
 */
const TICK_GRID_MINUTES = 15;

function dateKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function minutesOfDayUtc(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** Renvoie le créneau actif à l'instant `now`, ou `null` si hors créneau. */
export function getActiveWindow(now: Date): Window | null {
  const minuteOfDay = minutesOfDayUtc(now);
  for (const w of RAW_WINDOWS) {
    const startMinute = w.startH * 60;
    const endMinute = w.endH * 60;
    if (minuteOfDay >= startMinute && minuteOfDay < endMinute) {
      return {
        id: `${dateKey(now)}_${w.startH}`,
        startMinute,
        endMinute,
        label: w.label,
      };
    }
  }
  return null;
}

/**
 * true si ce tick est le DERNIER tick cron programmé à l'intérieur du
 * créneau (donc : c'est maintenant qu'on publie le meilleur setup si le
 * quota n'a pas déjà été consommé par une publication immédiate).
 */
export function isClosingTick(now: Date, window: Window): boolean {
  const minuteOfDay = minutesOfDayUtc(now);
  return minuteOfDay >= window.endMinute - TICK_GRID_MINUTES;
}

export function allWindowLabels(): string[] {
  return RAW_WINDOWS.map((w) => w.label);
}
