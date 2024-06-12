// NB: the below functions are borrowed from monorepo/utils/format

import { BigNumber } from "ethers";

// these should be moved to a utils esm package
export const shortenAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(-4)}`;

export const toUpperSnake = (s: string) =>
  s
    .replace(/([A-Z])/g, "_$1")
    .replace(/-/g, "_")
    .toUpperCase();

export const clearFrom = (s: string, regex: string): string =>
  s.substring(0, s.search(new RegExp(regex)));

export const clearNetworkTypeFromSlug = (slug: string): string =>
  clearFrom(slug, "-mainnet|-testnet");

export const toRaw = (s: string): string =>
  s.replace(/[^0-9A-Za-zÀ-ÖØ-öø-ÿ-_.,:;\s]+/g, "").toLowerCase().trim();

export const slugify = (s: string, sep="-") =>
  toRaw(s).replace(/[-_.,;\s]+/ig, sep);

export const nowEpochUtc = () => Math.floor(Date.now() / 1000);

export const cloneDeep = <T>(o: T): T =>
  o instanceof Array
    ? (o.map((item) => cloneDeep(item)) as unknown as T)
    : o instanceof Object
    ? (Object.fromEntries(
        Object.entries(o).map(([k, v]) => [k, cloneDeep(v)])
      ) as unknown as T)
    : o;

export const weiToString = (wei: number|string|bigint|BigNumber): string => {
  if (typeof wei === "string") {
    return wei;
  } else if (wei instanceof BigNumber) {
    return wei.toString();
  } else {
    if (typeof wei === "number")
      wei = BigInt(Math.round(wei));
    return wei.toString();
  // return wei.toLocaleString("en-US").replace(/,/g, "");
  }
}

export function abiFragmentSignature(abiFragment: any): string {
  if (abiFragment.type === "function") {
    return `${abiFragment.name}(${abiFragment.inputs
      .map((i: any) => i.type)
      .join(",")})`;
  } else {
    return `${abiFragment.name ?? ""}(${abiFragment.type})`;
  }
}
