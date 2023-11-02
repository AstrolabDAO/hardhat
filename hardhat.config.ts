import * as tdly from "@tenderly/hardhat-tenderly";
import * as dotenv from "dotenv";
import { INetwork } from "./types";
import { networks } from "./networks.ts";

dotenv.config({ override: true });
tdly.setup({ automaticVerifications: true });

if (!process.env?.TEST_MNEMONIC)
  throw new Error("missing env.TEST_MNEMONIC");

const accounts = {
  mnemonic: process.env?.TEST_MNEMONIC,
  // path: "m/44'/60'/0'/0",
  // initialIndex: 0,
  // count: 20,
};

const hhNetworks = networks
  .reduce((acc: { [slug: string]: any }, network: INetwork) => {

  acc[network.slug] = {
      url: network.httpRpcs[0],
      chainId: Number(network.id),
      accounts
  };
  return acc;
}, {
    hardhat: { accounts }
});

if (process.env.TENDERLY_FORK_ID) {
  // TODO: add support for multi forks / devNet
  hhNetworks.tenderly = {
    url: `https://rpc.tenderly.co/fork/${process.env.TENDERLY_FORK_ID}`,
    chainId: Number(process.env.TENDERLY_CHAIN_ID) ?? 1,
    accounts
  };
}

export default {
  solidity: "0.8.20",
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test/integration"
  },
  hhNetworks,
  tenderly: {
    username: process.env.TENDERLY_USER,
    project: process.env.TENDERLY_PROJECT,
    apiKey: process.env.TENDERLY_API_KEY,
    privateVerification: false,
  },
  mocha: {
    timeout: 1_200_000,
  },
}; // as Partial<HardhatConfig>;
