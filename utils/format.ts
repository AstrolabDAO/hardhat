
// NB: the below functions are borrowed from monorepo/utils/format
// these should be moved to a utils esm package
export const shortenAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(-4)}`;

export const toUpperSnake = (s: string) => s
    .replace(/([A-Z])/g, "_$1")
    .replace(/-/g, "_")
    .toUpperCase();

export const clearFrom = (s: string, regex: string): string =>
  s.substring(0, s.search(new RegExp(regex)));

export const clearNetworkTypeFromSlug = (slug: string): string =>
  clearFrom(slug, "-mainnet|-testnet");
