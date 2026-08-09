export type DemoAccount = {
  availableBalance: number;
  walletBalance: number;
  unrealizedProfit: number;
};

export type DemoPosition = {
  symbol: string;
  positionAmt: number;
  entryPrice: number;
  unrealizedProfit: number;
  leverage: number;
  /** Deriv contract id (stringified). */
  contractId?: string;
};

export type PlaceDemoInput = {
  symbol: string;
  direction: "LONG" | "SHORT";
  stopLoss: number;
  takeProfit: number;
  notionalUsdt?: number;
  leverage?: number;
};

export type PlaceDemoResult = {
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  entryOrderId: string;
  entryPrice: number;
  slOrderId?: string;
  tpOrderId?: string;
};

export type DemoIncome = {
  symbol: string;
  income: number;
  time: number;
  incomeType: string;
  contractId?: string;
};

export type DemoProviderName = "binance" | "deriv";
