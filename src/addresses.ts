import {
  Contract as MulticallContract,
  Provider as MulticallProvider,
} from "ethcall";
import { BigNumber, Contract, ethers, providers } from "ethers";
import { network } from "hardhat";
import { Network } from "hardhat/types";

import { ADDRESSES_URL } from "./constants";
import { getRegistryLatest } from "./hardhat";
import { networkBySlug } from "./networks";
import { Addresses, NetworkAddresses, SignerWithAddress } from "./types";

import { ERC20_ABI } from "./constants";
import { getDeployer } from "./hardhat";

const sfetch = require('sync-fetch')

export const crossChainAddresses = {
  safe: {
    // https://github.com/safe-global/safe-smart-account/blob/main/CHANGELOG.md
    proxyFactory: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2", // "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67", // "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67", // v1.5
    singleton: "0x41675C099F32341bf84BFc5382aF534df5C7461a",
    singletonL2: "0x3e5c63644e683549055b9be8653de26e0b4cd36e", // 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762", // "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762",
    callbackHandler: "0xeDCF620325E82e3B9836eaaeFdc4283E99Dd7562", // "0x1AC114C2099aFAf5261731655Dc6c306bFcd4Dbd",
    compatibilityFallbackHandler: "0xf48f2b2d2a534e402487b3ee7c18c33aec0fe5e4", // "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99", // "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99",
  },
  astrolab: {
    ...getRegistryLatest(), // Swapper, AccessController, ChainlinkProvider, PriceProvider, StrategyV5Agent
  },
}

const symbolByAddress: { [chainId: number]: { [address: string]: string } } = {};

export function findSymbolByAddress(address: string, chainId: number): string | undefined {
  const networkAddresses = addresses[chainId];
  if (!networkAddresses) {
    console.log(`Network with chainId ${chainId} is not supported.`);
    return;
  }

  if (symbolByAddress[chainId]?.[address]) {
    return symbolByAddress[chainId][address];
  }

  const tokens = networkAddresses.tokens;
  for (const symbol in tokens) {
    const candidate = tokens[symbol];
    if (candidate.toLowerCase() === address.toLowerCase()) {
      // cache the symbol for future lookups
      if (!symbolByAddress[chainId]) symbolByAddress[chainId] = {};
      symbolByAddress[chainId][address] = symbol;
      return symbol;
    }
  }

  // console.log(`Address ${address} not found in chainId ${chainId}'s tokens.`);
  return undefined;
}

export const getAddresses = (): Addresses => {
  const addressesByChain = sfetch(ADDRESSES_URL).json();
  const addresses: Addresses = {};
  for (const id of Object.keys(addressesByChain)) {
    addresses[Number(id)] = {
      ...crossChainAddresses,
      ...addressesByChain[id],
    } as NetworkAddresses;
  }
  return addresses;
}

export const addresses = getAddresses();

// addresses[42161] == byNetwork("arbitrum-mainnet-one")
export const byNetwork = (id: string | number) =>
  addresses[id as number] ?? addresses[networkBySlug[id].id];

export class SafeContract extends Contract {
  public multi: MulticallContract = {} as MulticallContract;
  public sym: string = "";
  public abi: ReadonlyArray<any> | any[] = [];
  public scale: number = 0;
  public weiPerUnit: number = 0;

  constructor(
    address: string,
    abi: ReadonlyArray<any> | any[] = ERC20_ABI,
    signer: SignerWithAddress | providers.JsonRpcProvider
  ) {
    super(address, abi, signer);
    this.abi = abi;
  }

  public static async build(
    address: string,
    abi: ReadonlyArray<any> | any[] = ERC20_ABI,
    signer?: SignerWithAddress
  ): Promise<SafeContract> {
    try {
      signer ||= (await getDeployer()) as SignerWithAddress;
      const c = new SafeContract(address, abi, signer);
      c.multi = new MulticallContract(address, abi as any[]);
      if ("symbol" in c) {
        // c is a token
        try {
          c.sym = findSymbolByAddress(c.address, network.config.chainId!) || await c.symbol?.();
          c.scale = await c.decimals?.() || 12;
        } catch {
          // shallow agent/strat implementation
          c.sym = "???";
          c.scale = 12;
        }
        c.weiPerUnit = 10 ** c.scale;
      }
      return c;
    } catch (error) {
      throw new Error(`Failed to build contract ${address}: ${error}`);
    }
  }

  public async copy(signer: SignerWithAddress=(this.signer as SignerWithAddress)): Promise<SafeContract> {
    // return Object.assign(this, await SafeContract.build(this.address, this.abi, signer));
    return await SafeContract.build(this.address, this.abi, signer);
  }

  public safe = async (
    fn: string,
    params: any[],
    opts: any = {}
  ): Promise<any> => {
    if (typeof this[fn] != "function")
      throw new Error(`${fn} does not exist on the contract ${this.address}`);
    try {
      await this.callStatic[fn](...params, opts);
    } catch (error) {
      const txData = this.interface.encodeFunctionData(fn, params);
      throw new Error(`${fn} static call failed, tx not sent: ${error}, txData: ${txData}`);
    }
    console.log(`${fn} static call succeeded, sending tx...`);
    return this[fn](...params, opts);
  };

  public toWei = (n: number | bigint | string | BigNumber): BigNumber => {
    return ethers.utils.parseUnits(n.toString(), this.scale);
  };

  public toAmount = (n: number | bigint | string | BigNumber): number => {
    const weiString = ethers.utils.formatUnits(n, this.scale);
    return parseFloat(weiString);
  };
}

export interface ITestEnv {
  // env: chain/addresses
  network: Network; // hardhat inherited
  blockNumber: number;
  snapshotId: string;
  revertState: boolean; // should we revert state after test
  wgas: SafeContract; // wrapped gas == native token
  addresses: NetworkAddresses;
  oracles: { [feed: string]: string };
  // deployer
  deployer: SignerWithAddress; // provided by hardhat
  provider: providers.JsonRpcProvider;
  multicallProvider: MulticallProvider;
  // funding
  needsFunding: boolean;
  gasUsedForFunding: number;
}

export default addresses;
