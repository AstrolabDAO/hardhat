import { createHash } from "crypto";
import { ethers, network } from "hardhat";
const sfetch = require("sync-fetch");

import addresses, { ITestEnv } from "../addresses";
import { CHAINLINK_FEEDS_URL, PYTH_FEEDS_URL } from "../constants";
import { Log, MaybeAwaitable, SignerWithAddress, TransactionReceipt } from "../types";

export const arraysEqual = (a: any[], b: any[]) =>
  a === b ||
  (a && b && a.length === b.length && a.every((val, idx) => val === b[idx]));

export const duplicatesOnly = (a: any[]) =>
  a.every((v) => v === a[0]);

export function packBy(arr: any[], groupSize=2): any[] {
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

export async function isDeployed(env: Partial<ITestEnv>, address: string) {
  if (env.addresses!) {
    const actual = Object.keys(env.addresses!).find((key) => env.addresses![key]![address]);
    address = actual ?? address; // if address is an alias, use the actual address
  }
  try {
    await ethers.provider.getCode(address);
    return true;
  } catch (e) {
    return false;
  }
}

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

export function isLive(env: any) {
  const n = env.network ?? network;
  return !["tenderly", "localhost", "hardhat"].some((s) => n?.name.includes(s));
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

export function getAddresses(s: string) {
  return isAddress(s) ? s : addresses[network.config.chainId!].tokens[s];
}

export function getSelectors(abi: any) {
  const i = new ethers.utils.Interface(abi);
  return Object.keys(i.functions).map((signature) => ({
    name: i.functions[signature].name,
    signature: i.getSighash(i.functions[signature]),
  }));
}
