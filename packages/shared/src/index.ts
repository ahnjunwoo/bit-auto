export type PriceSource = "coingecko" | "coinbase" | (string & {});

export type PriceResponse<
  TSymbol extends string = "BTC",
  TCurrency extends string = "USD"
> = {
  symbol: TSymbol;
  currency: TCurrency;
  price: number;
  source: PriceSource;
  cached: boolean;
  stale: boolean;
  fetchedAt: string;
};
