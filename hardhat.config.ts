export * from "@nomiclabs/hardhat-ethers";
export * from "@nomicfoundation/hardhat-verify";
export * from "@nomicfoundation/hardhat-network-helpers";
import * as tenderly from "@tenderly/hardhat-tenderly";
import * as dotenv from "dotenv";
import { INetwork } from "./types";
import { networks } from "./networks";
import { clearNetworkTypeFromSlug } from "./utils/format";

dotenv.config({ override: true });
tenderly.setup({ automaticVerifications: false });

if (!process.env?.TEST_MNEMONIC)
  throw new Error("missing env.TEST_MNEMONIC");

process.env.REGISTRY_DIR ??= "./registry"

const accounts = {
  mnemonic: process.env?.TEST_MNEMONIC,
  // path: "m/44'/60'/0'/0",
  // initialIndex: 0,
  // count: 20,
};

const [hhNetworks, scanKeys] = networks
  .reduce((acc: [{ [slug: string]: any }, { [slug: string]: any }], network: INetwork) => {
    const [networks, keys] = acc;
    const slug = clearNetworkTypeFromSlug(network.slug!);
    const varname = `${slug}-scan-api-key`;
    // combination of hh network and scan customChain objects for reusability
    networks[network.slug] = {
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
    keys[network.slug] = process.env[varname];

    if (network.slug.includes("mainnet")) {

      // generate a local fork (transient) config for every known mainnet
      networks[`${slug}-local`] = {
        network: `${slug}-local`,
        forking: {
          enabled: true,
          url: network.httpRpcs[0], // Mainnet URL to fork from
          // blockNumber: "latest"
        },
        url: network.httpRpcs[0],
        port: process.env.HARDHAT_PORT ?? 8545,
        chainId: Number(network.id),
        accounts: {
          ...accounts,
          accountsBalance: "10000000000000000000000",
        },
      };
      // check for known tenderly fork (persistent) in .env in addition to the local fork
      const varname = `${slug}-tenderly-fork-id`;
      const forkId = process.env[varname];
      if (forkId && Number(process.env.TENDERLY_CHAIN_ID) == network.id) {
        // TODO: add support for devNet
        networks[`tenderly`] = {
          network: `tenderly`,
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

const config = {
  solidity: "0.8.20",
  paths: {
    registry: process.env.REGISTRY_DIR,
    abis: process.env.REGISTRY_DIR + "./abis",
    interfaces: process.env.REGISTRY_DIR + "./interfaces",

    cache: process.env.CACHE_DIR + "./cache",
    artifacts: process.env.ARTIFACTS_DIR ?? "./artifacts",
    sources: process.env.CONTRACTS_DIR ?? "./contracts",
    tests: process.env.CONTRACTS_TESTS_DIR ?? "./test/integration",
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
    reporter: "mocha-multi",
    reporterOptions: {
      spec: "-", // default mocha reporter
      json: "./test-report.json",
    },
  },
  etherscan: {
    customChains: hhNetworks,
    apiKey: scanKeys
  },
}; // as Partial<HardhatConfig>;

export { tenderly, config };
