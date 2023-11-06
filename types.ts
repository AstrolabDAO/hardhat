import { BigNumber, BigNumberish, BytesLike, Signer, Transaction, Wallet } from "ethers";

export interface IDeployment extends IDeploymentUnit {
  units?: { [unit: string]: IDeploymentUnit };
}

export interface IDeploymentUnit {
  contract: string;
  name?: string;
  slug?: string;
  chainId?: number;
  address?: string;
  tx?: string;
  version?: number;
  deployer?: Signer;
  provider?: Wallet;
  local?: boolean;
  args?: unknown;
  export?: boolean;
  exported?: boolean;
  verify?: boolean;
  verified?: boolean;
  libraries?: Record<string, string>;
}

export interface INetwork {
  name?: string;
  slug: string;
  landing?: string;
  blockNumber?: number;
  id: number;
  lzId?: number;
  lzEndpoint?: string;
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

export interface IArtefacts {
  interface?: string;
  abi?: any;
  bytecode?: string;
  deployedBytecode?: string;
  linkReferences?: any;
  deployedLinkReferences?: any;
  deployedSolcVersion?: string;
  sourceMap?: string;
}
