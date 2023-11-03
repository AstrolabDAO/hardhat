export * from "@nomiclabs/hardhat-ethers";
export * from "@nomiclabs/hardhat-etherscan";
import * as tdly from "@tenderly/hardhat-tenderly";
import * as dotenv from "dotenv";
import { INetwork } from "./types";
import { networks } from "./networks";
import { clearNetworkTypeFromSlug, toUpperSnake } from "utils";

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

const [hhNetworks, scanKeys] = networks
  .reduce((acc: [{ [slug: string]: any }, { [slug: string]: any }], network: INetwork) => {
    const slug = clearNetworkTypeFromSlug(network.slug!);
    const varname = `${slug}-scan-api-key`;
    // combination of hh network and scan customChain objects for reusability
    acc[0][network.slug] = {
      network: network.slug,
      url: network.httpRpcs[0],
      urls: {
        apiURL: network.explorerApi
          ?.replace("{key}", process.env[varname] ?? ""),
        browserURL: network.explorers![0]
      },
      chainId: Number(network.id),
      accounts
    };

    // scan api keys
    acc[1][network.slug] = process.env[varname];

    // check for tenderly forks in .env
    if (network.slug.includes("mainnet")) {
      const varname = `${slug}-tenderly-fork-id`;
      const forkId = process.env[varname];
      if (forkId) {
        // TODO: add support for multi forks / devNet
        acc[0][`${network.slug}-tenderly`] = {
          network: `${network.slug}-tenderly`,
          url: `https://rpc.tenderly.co/fork/${forkId}`,
          urls: {
            apiURL: "", // https://api.tenderly.co/api/v1/account/${process.env.TENDERLY_USER}/project/${process.env.TENDERLY_PROJECT}
            browserURL: `https://dashboard.tenderly.co/shared/fork/${forkId}/transactions`
          },
          chainId: Number(process.env[`${slug}-tenderly-chain-id`]) || network.id,
          accounts
        };
      }
    }
    return acc;
  }, [{ hardhat: { accounts } }, {}]);

export default {
  solidity: "0.8.20",
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: process.env.CONTRACTS_DIR ?? "./contracts",
    tests: process.env.CONTRACTS_TESTS_DIR ?? "./test/integration"
  },
  networks: hhNetworks,
  tenderly: {
    username: process.env.TENDERLY_USER,
    project: process.env.TENDERLY_PROJECT,
    apiKey: process.env.TENDERLY_API_KEY,
    privateVerification: false,
  },
  mocha: {
    timeout: 1_200_000,
  },
  etherscan: {
    customChains: hhNetworks,
    apiKey: scanKeys
  },
}; // as Partial<HardhatConfig>;
