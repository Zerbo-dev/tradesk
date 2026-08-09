import type { Direction } from "./detect";

export type SmcSignal = {
  pair: "XAUUSD" | "V100";
  direction: Direction;
  timeframe: string;
  setup: string;
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  /** Display RR vs TP2/TP3 average — we show vs TP mid risk units */
  rr: number;
  oteLow: number | null;
  oteHigh: number | null;
  confluence: string;
  fingerprint: string;
  price: number;
};

export type SmcScanResult = {
  signals: SmcSignal[];
  empty: boolean;
  errors: string[];
  skipped: { pair: string; reason: string }[];
};
