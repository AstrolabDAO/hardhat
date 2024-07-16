import { BigNumber, BigNumberish, BytesLike, Overrides, Signer, Transaction, Wallet } from "ethers";

export interface IDeploymentInfo {
  byteSize: number;
  isDeployed: boolean;
}

export interface IVerificationInfo {
  isVerified: boolean;
  events: number;
  viewFunctions: number;
  mutableFunctions: number;
}

export interface SignerWithAddress extends Signer {
  address: string;
}

export interface IDeployment extends IDeploymentUnit {
  units?: { [unit: string]: IDeploymentUnit };
}

export interface IDeploymentUnit {
  contract: string;
  name: string;
  slug?: string;
  chainId?: number;
  address?: string;
  tx?: string;
  version?: number;
  deployer?: Signer;
  provider?: Wallet;
  local?: boolean;
  args?: unknown[];
  deployed?: boolean;
  export?: boolean;
  exported?: boolean;
  verify?: boolean;
  verified?: boolean;
  libraries?: Record<string, string>;
  proxied?: string[];
  useCreate3?: boolean; // for deterministic deployment
  create3Salt?: string; // replaces create2 bytecode+args as contract signature
  create3Bytecode?: string; // replaces contract bytecode
  overrides?: Overrides; // tx overrides
}

export interface INetwork {
  name?: string;
  slug: string;
  landing?: string;
  blockNumber?: number;
  id: number;
  lzId?: number;
  lzEndpoint?: string;
  create3Deployer?: string;
  defiLlamaId?: string;
  httpRpcs: string[];
  wsRpcs?: string[];
  explorers?: string[];
  explorerApi?: string;
}

export type TransactionRequest = {
  to?: string,
  from?: string,
  nonce?: BigNumberish,

  gasLimit?: BigNumberish,
  gasPrice?: BigNumberish,

  data?: BytesLike,
  value?: BigNumberish,
  chainId?: number

  type?: number;
  accessList?: any;

  maxPriorityFeePerGas?: BigNumberish;
  maxFeePerGas?: BigNumberish;

  customData?: Record<string, any>;
  ccipReadEnabled?: boolean;
}

export interface TransactionResponse extends Transaction {
  hash: string;

  // Only if a transaction has been mined
  blockNumber?: number,
  blockHash?: string,
  timestamp?: number,

  confirmations: number,

  // Not optional (as it is in Transaction)
  from: string;

  // The raw transaction
  raw?: string,

  // This function waits until the transaction has been mined
  wait: (confirmations?: number) => Promise<TransactionReceipt>
};

export type BlockTag = string | number;

export interface _Block {
  hash: string;
  parentHash: string;
  number: number;

  timestamp: number;
  nonce: string;
  difficulty: number;
  _difficulty: BigNumber;

  gasLimit: BigNumber;
  gasUsed: BigNumber;

  miner: string;
  extraData: string;

  baseFeePerGas?: null | BigNumber;
}

export interface Block extends _Block {
  transactions: Array<string>;
}

export interface BlockWithTransactions extends _Block {
  transactions: Array<TransactionResponse>;
}


export interface Log {
  blockNumber: number;
  blockHash: string;
  transactionIndex: number;

  removed: boolean;

  address: string;
  data: string;

  topics: Array<string>;

  transactionHash: string;
  logIndex: number;
}

export interface TransactionReceipt {
  to: string;
  from: string;
  contractAddress: string,
  transactionIndex: number,
  root?: string,
  gasUsed: BigNumber,
  logsBloom: string,
  blockHash: string,
  transactionHash: string,
  logs: Array<Log>,
  blockNumber: number,
  confirmations: number,
  cumulativeGasUsed: BigNumber,
  effectiveGasPrice: BigNumber,
  byzantium: boolean,
  type: number;
  status?: number
};

// inherits from hardhat/types/Artifact
export interface IArtifact {
  _format?: string;
  contractName?: string;
  sourceName?: string;
  interface?: string;
  abi?: any[];
  bytecode?: string;
  deployedBytecode?: string;
  linkReferences?: any;
  deployedLinkReferences?: any;
  deployedSolcVersion?: string;
  sourceMap?: string;
}

export interface IVerifiable {
  name: string;
  address: string;
  constructorArguments?: unknown[];
  libraries?: Record<string, string>;
}

export type MaybeAwaitable<T> = T | Promise<T>;

export interface Erc20Metadata {
  name: string;
  symbol: string;
  decimals?: number;
  version?: string;
}

export type NetworkAddresses = {
  // common addresses
  accounts?: { [token: string]: string };
  oracles?: { [token: string]: string };
  tokens: { [name: string]: string };
  libs?: { [name: string]: string };
  safe?: { [name: string]: string };
  // protocol specific addresses
  [protocol: string]: { [name: string]: any } | undefined;
  astrolab?: {
    [contract: string]: string;
    Swapper: string;
    StrategyV5Agent: string;
  };
};

export type Addresses = {
  [networkId: number]: NetworkAddresses;
};
