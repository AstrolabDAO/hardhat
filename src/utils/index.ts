export * from "./fs";
export * from "./format";
import { createHash } from "crypto";
import { ethers, network } from "hardhat";
const sfetch = require("sync-fetch");

import addresses, { ITestEnv } from "../addresses";
import { CHAINLINK_FEEDS_URL, PYTH_FEEDS_URL } from "../constants";
import { IDeploymentInfo, INetwork, IVerificationInfo, Log, MaybeAwaitable, SignerWithAddress, TransactionReceipt } from "../types";
import { networkById, networkBySlug } from "../networks";
import { clearNetworkTypeFromSlug } from "./format";

export const arraysEqual = (a: any[], b: any[]) =>
  a === b ||
  (a && b && a.length === b.length && a.every((val, idx) => val === b[idx]));

export const duplicatesOnly = (a: any[]) =>
  a.every((v) => v === a[0]);

export function packBy(arr: any[], groupSize = 2): any[] {
  const pairs = [];
  for (let i = 0; i < arr.length; i += groupSize) {
    pairs.push(arr.slice(i, i + groupSize));
  }
  return pairs;
}

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const isStable = (s: string) =>
  [
    "USDC",
    "USDCe",
    "USDbC",
    "xcUSDC",
    "lzUSDC",
    "sgUSDC",
    "axlUSDC",
    "whUSDC",
    "cUSDC",
    "USDT",
    "USDTe",
    "xcUSDT",
    "lzUSDT",
    "sgUSDT",
    "axlUSDT",
    "whUSDT",
    "BUSD",
    "DAI",
    "DAIe",
    "XDAI",
    "sDAI",
    "lzDAI",
    "axlDAI",
    "whDAI",
    "xcDAI",
    "XDAI",
    "WXDAI",
    "SDAI",
    "FRAX",
    "sFRAX",
    "LUSD",
    "USDD",
    "CRVUSD",
    "GHO",
    "DOLA",
    "USDP",
    "USD+",
    "USDD",
    "EURS",
    "EURT",
    "EURTe",
    "EURA",
    "cEUR",
    "USD",
    "EUR",
    "EURE",
    "USDe"
  ].includes(s.toUpperCase());

export const isStablePair = (s1: string, s2: string) =>
  isStable(s1) && isStable(s2);

export const isOracleLib = (name: string) =>
  ["Pyth", "RedStone", "Chainlink", "Witnet", "API3"].some((libname) =>
    name.includes(libname),
  );

export function abiEncode(
  types: string[],
  values: any[],
  isTuple = false,
): string {
  return ethers.utils.defaultAbiCoder.encode(types, values);
}

export function abiDecode(
  types: string[],
  data: string,
  isTuple = false,
): any {
  return ethers.utils.defaultAbiCoder.decode(types, data);
}

/**
 * Retrieves the data from a transaction log (used as flows return value)
 * @param tx - Transaction receipt
 * @param types - Array of types to decode the log data
 * @param outputIndex - Index of the decoded data to return
 * @param logIndex - Index or event name of the log to retrieve
 * @returns The decoded data from the log, or undefined if not found/parsing failure
 */
export function getTxLogData(
  tx: TransactionReceipt,
  types = ["uint256"],
  outputIndex = 0,
  logIndex: string | number = -1,
): any {
  const logs = (tx as any).events || tx.logs;
  let log: Log;
  try {
    if (!logs?.length) throw "No logs found on tx ${tx.transactionHash}";
    if (typeof logIndex === "string") {
      log = logs.find((l: any) => l?.event === logIndex) as Log;
    } else {
      if (logIndex < 0) logIndex = logs.length + logIndex;
      log = logs[logIndex];
    }
    if (!log) throw `Log ${logIndex} not found on tx ${tx.transactionHash}`;
    const decoded = ethers.utils.defaultAbiCoder.decode(types, log.data);
    return decoded?.[outputIndex];
  } catch (e) {
    console.error(
      `Failed to parse log ${e}: tx ${tx.transactionHash} probably reverted`,
    );
    return undefined;
  }
}

/**
 * Finds a function name in the given ABI (Application Binary Interface) based on its signature
 * @param signature - Function signature to search for
 * @param abi - ABI array to search in
 * @returns The name of the function matching the provided signature
 * @throws Error if the function signature is not found in the ABI
 */
export function findSignature(signature: string, abi: any[]): string {
  for (let item of abi) {
    // Ensure the item is a function and has an 'inputs' field
    if (item.type === "function" && item.inputs) {
      // Construct the function signature string
      const funcSig = `${item.name}(${item.inputs
        .map((input: any) => input.type)
        .join(",")})`;

      // Compute the hash of the function signature
      const hash = ethers.utils.id(funcSig).substring(0, 10); // utils.id returns the Keccak-256 hash, we only need the first 10 characters

      // Compare the hash with the provided signature
      if (hash === signature) {
        return item.name;
      }
    }
  }
  throw new Error(`Function signature ${signature} not found in ABI`);
}

export async function resolveAddress(addr: string, env?: Partial<ITestEnv>): Promise<string> {
  if (!addr) {
    throw new Error('Address missing to resolve');
  }
  if (isAddress(addr)) {
    return addr;
  }
  if (env?.addresses) {
    const fromRegistry =
      env.addresses.tokens?.[addr] ??
      env.addresses.libs?.[addr] ??
      env.addresses.astrolab?.[addr];
    if (fromRegistry) {
      return fromRegistry;
    }
  }
  try {
    const fromEns = await ethers.provider.resolveName(addr);
    if (fromEns) {
      return fromEns;
    }
  } catch (e) {
    console.error(e);
  }
  console.error(`Could not resolve address ${addr} (tried Astrolab registry and ENS).`);
  return "";
}

export async function getDeploymentInfo(addr: string, env?: Partial<ITestEnv>): Promise<IDeploymentInfo> {
  await new Promise((r) => setTimeout(r, 100)); // avoids rate limiting when chained
  addr = await resolveAddress(addr, env);
  if (!addr) {
    return { isDeployed: false, byteSize: 0 };
  }
  let provider = ethers.provider;
  if (isLocal()) {
    const forkedRpc = (env!.network?.config as any)?.forking?.url;
    provider =  new ethers.providers.JsonRpcProvider(forkedRpc);
  }
  try {
    const code = await provider.getCode(addr);
    const isDeployed = code !== "0x";
    const byteSize = isDeployed ? (code.length - 2) / 2 : 0; // Subtract 2 for "0x", divide by 2 as each byte is 2 hex chars
    return { isDeployed, byteSize };
  } catch (e) {
    if ((e as any).toString().includes("issing trie node")) {
      console.warn(`Provided RPC is not an archive node, cannot retrieve code for ${addr}`);
      return { isDeployed: false, byteSize: 0 };
    }
    throw e;
  }
}

export const isDeployed = (addr: string, env?: Partial<ITestEnv>) => getDeploymentInfo(addr, env).then((info) => info.isDeployed);

export async function getVerificationInfo(addr: string, apiUrl?: string, apiKey?: string, retries = 3, env?: Partial<ITestEnv>): Promise<IVerificationInfo> {

  addr = await resolveAddress(addr, env);
  if (!addr) {
    return { isVerified: false, events: 0, viewFunctions: 0, mutableFunctions: 0 };
  }
  const chainId = await ethers.provider.getNetwork().then((n) => n.chainId);
  const network = networkById[chainId];
  if (!apiUrl) apiUrl = network.explorerApi!;
  if (!apiKey) {
    const slug = clearNetworkTypeFromSlug(network.slug!); // remove "mainnet" or "testnet" from slug
    apiKey = process.env[`${slug}-scan-api-key`]
  }
  if (!apiKey || !apiUrl) {
    throw new Error(`API key or URL not provided nor available in ENV for ${network.slug} (${chainId})`);
  }
  try {
    const res = await fetch(`${apiUrl}?module=contract&action=getabi&address=${addr}&apikey=${apiKey}`);
    const { status, result } = await res.json();

    if (status !== '1' || !result) return { isVerified: false, events: 0, viewFunctions: 0, mutableFunctions: 0 };

    const counts = JSON.parse(result).reduce((acc: IVerificationInfo, { type, mutability }: { type: string, mutability: string }) => {
      if (type === 'event') acc.events++;
      else if (type === 'function') {
        mutability === 'view' || mutability === 'pure' ? acc.viewFunctions++ : acc.mutableFunctions++;
      }
      return acc;
    }, { events: 0, viewFunctions: 0, mutableFunctions: 0 });

    return { isVerified: true, ...counts };
  } catch (error) {
    console.error('Verification check error:', error);
    if (retries > 0) {
      console.log('Retrying...');
      await new Promise((r) => setTimeout(r, 150 * (retries ** 2))); // throttle requests to avoid rate limiting
      return await getVerificationInfo(addr, apiUrl, apiKey, retries--);
    }
    return { isVerified: false, events: 0, viewFunctions: 0, mutableFunctions: 0 };
  }
}

export const isVerified = (addr: string, apiUrl?: string, apiKey?: string, retries?: number, env?: Partial<ITestEnv>) =>
    getVerificationInfo(addr, apiUrl, apiKey, retries, env).then((info) => info.isVerified);

/**
 * Converts a given text into a nonce (used for nonce determinism)
 * @param text - Text to be converted into a nonce
 * @returns The nonce as a number
 */
export function toNonce(text: string): number {
  // Hash the text using SHA-256
  const hash = createHash("sha256");
  hash.update(text);
  // Convert the hash into a hexadecimal string
  const hexHash = hash.digest("hex");
  // Convert the hexadecimal hash into an integer
  // NB: we use a hash substring to as js big numeric management is inacurate
  const nonce = parseInt(hexHash.substring(0, 15), 16);
  return nonce;
}

let chainlinkFeeds: any;
export const getChainlinkFeedsByChainId = () => {
  if (!chainlinkFeeds) {
    chainlinkFeeds = sfetch(CHAINLINK_FEEDS_URL).json();
  }
  return chainlinkFeeds;
}

let pythFeeds: any;
export const getPythFeeds = () => {
  if (!pythFeeds) {
    pythFeeds = sfetch(PYTH_FEEDS_URL).json();
  }
  return pythFeeds;
}

export function isAddress(s: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

export function addressToBytes32(address: string) {
  if (!isAddress(address)) throw new Error(`Invalid address: ${address}`);
  return ethers.utils.hexZeroPad(address, 32);
}

export function isAwaitable(o: any): boolean {
  return typeof o?.then === "function"; // typeof then = "function" for promises
}

export async function resolveMaybe<T = any>(o: MaybeAwaitable<T>): Promise<T> {
  return isAwaitable(o) ? await o : o;
}

export async function signerGetter(index: number): Promise<SignerWithAddress> {
  return (await ethers.getSigners())[index];
}

export async function signerAddressGetter(index: number): Promise<string> {
  return (await signerGetter(index)).address;
}

export function getSelectors(abi: any) {
  const i = new ethers.utils.Interface(abi);
  return Object.keys(i.functions).map((signature) => ({
    name: i.functions[signature].name,
    signature: i.getSighash(i.functions[signature]),
  }));
}

export async function increaseTime(seconds: number, env: ITestEnv) {
  await env.provider.send("evm_increaseTime", [
    ethers.utils.hexValue(seconds),
  ]);
  if (env.network.name.includes("tenderly")) {
    await env.provider.send("evm_increaseBlocks", ["0x20"]); // tenderly
  } else {
    await env.provider.send("evm_mine", []); // ganache/local fork
  }
}

export const getChainId = () => getHardhatNetwork().then((n) => n.chainId);
export const getHardhatNetwork = () => ethers.provider.getNetwork();
export const getNetwork = async (network: INetwork|string|number|undefined): Promise<INetwork> => {
  network ??= await getHardhatNetwork().then((n) => n.chainId);
  return typeof network === 'string' ? networkBySlug[network]
    : typeof network === 'number' ? networkById[network]
      : network as INetwork;
}
export const getNetworkTimestamp = () => ethers.provider.getBlock("latest").then((b) => b.timestamp);
export const getBlockNumber = () => ethers.provider.getBlockNumber();
export const getBlockTimestamp = (blockNumber: number) => ethers.provider.getBlock(blockNumber).then((b) => b.timestamp);
export const isTenderly = () => network.name.includes("tenderly");
export const isHardhat = () => network.config.chainId == 31337 || network.name.includes("hardhat");
export const isLive = (env: any) =>
  !["tenderly", "localhost", "hardhat", "testnet"].some((s) =>
      (env.network ?? network)?.name.toLowerCase().includes(s));
export const isLocal = () => {
  const networkName = (network.config as any)?.network ?? network.name;
  return (
    network.config.chainId == 31337 ||
    ["local", "hardhat"].some((n) => networkName.includes(n))
  );
};
