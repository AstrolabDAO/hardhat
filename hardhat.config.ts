export * from "@nomiclabs/hardhat-ethers";
export * from "@nomiclabs/hardhat-etherscan";
export * from "@nomicfoundation/hardhat-network-helpers";
import * as tenderly from "@tenderly/hardhat-tenderly";
import * as dotenv from "dotenv";
import { INetwork } from "./types";
import { networks } from "./networks";
import { clearNetworkTypeFromSlug } from "./utils/format";
import { HardhatConfig, NetworksConfig, ProjectPathsConfig, SolidityConfig } from "hardhat/types";

dotenv.config({ override: true });
tenderly.setup({ automaticVerifications: false });

if (!process.env?.TEST_MNEMONIC) throw new Error("missing env.TEST_MNEMONIC");

process.env.REGISTRY_DIR ??= "./registry";

const accounts = {
  mnemonic: process.env?.TEST_MNEMONIC,
  // path: "m/44'/60'/0'/0",
  // initialIndex: 0,
  // count: 20,
};

interface ExtendedHardhatConfig extends HardhatConfig {
  defaultNetwork: string;
  paths: ProjectPathsConfig & { registry: string, abis: string, interfaces: string };
  networks: NetworksConfig;
  solidity: SolidityConfig;
  mocha: Mocha.MochaOptions;
}

type CustomPaths = ProjectPathsConfig & { registry: string, abis: string, interfaces: string };

const [hhNetworks, scanKeys] = networks
  .reduce((acc: [{ [slug: string]: any }, { [slug: string]: any }], network: INetwork) => {
    const [networks, keys] = acc;
    const slug = clearNetworkTypeFromSlug(network.slug!);
    // combination of hh network and scan customChain objects for reusability
    networks[network.slug] = {
      network: network.slug,
      url: network.httpRpcs[0],
      urls: {
        apiURL: network.explorerApi?.replace(
          "{key}",
          process.env[`${slug}-scan-api-key`] ?? ""
        ),
        browserURL: network.explorers![0],
      },
      chainId: Number(network.id),
      accounts,
    };

    // scan api keys
    keys[network.slug] = process.env[`${slug}-scan-api-key`];

    if (network.slug.includes("mainnet")) {
      // generate a local fork (transient) config for every known mainnet
      if (Number(process.env.HARDHAT_CHAIN_ID) == network.id) {
        networks["hardhat"] = {
          network: "hardhat",
          forking: {
            enabled: !process.env.HARDHAT_FORK_URL, // if fork already exists, use it
            url: network.httpRpcs[0], // if fork is missing, use the selected mainnet default rpc to fork from
            // blockNumber: "latest"
          },
          port: process.env.HARDHAT_PORT || 8545,
          url: process.env.HARDHAT_FORK_URL || `http://localhost:${process.env.HARDHAT_PORT || 8545}`,
          chainId: Number(process.env[`${slug}-hardhat-chain-id`]) || network.id,
          accounts: {
            ...accounts,
            accountsBalance: "100000000000000000000000",
          },
        };
      }
      // check for known tenderly fork (persistent) in .env in addition to the local fork
      const forkId = process.env[`${slug}-tenderly-fork-id`];
      if (forkId && Number(process.env.TENDERLY_CHAIN_ID) == network.id) {
        // TODO: add support for tenderly devNets
        networks[`tenderly`] = {
          network: `tenderly`,
          url: `https://rpc.tenderly.co/fork/${forkId}`,
          urls: {
            apiURL: "", // https://api.tenderly.co/api/v1/account/${process.env.TENDERLY_USER}/project/${process.env.TENDERLY_PROJECT}
            browserURL: `https://dashboard.tenderly.co/shared/fork/${forkId}/transactions`,
          },
          chainId:
            Number(process.env[`${slug}-tenderly-chain-id`]) || network.id,
          accounts,
        };
      }
    }
    return acc;
  },
  [{ hardhat: { accounts } }, {}]
);

const config = {
  solidity: {
    compilers: [{
      version: "0.8.20",
      settings: {
        optimizer: {
          enabled: true,
          runs: 100,
        },
      }
    }]
  } as SolidityConfig,
  paths: {
    root: process.env.PROJECT_DIR ?? "./",
    configFile: process.env.HARDHAT_CONFIG ?? "./hardhat.config.ts",
    registry: process.env.REGISTRY_DIR,
    abis: process.env.REGISTRY_DIR + "./abis",
    interfaces: process.env.REGISTRY_DIR + "./interfaces",

    cache: process.env.CACHE_DIR + "./cache",
    artifacts: process.env.ARTIFACTS_DIR ?? "./artifacts",
    sources: process.env.CONTRACTS_DIR ?? "./contracts",
    tests: process.env.CONTRACTS_TESTS_DIR ?? "./test/integration",
  } as CustomPaths,
  networks: hhNetworks as NetworksConfig,
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
    customChains: Object.values(hhNetworks),
    apiKey: scanKeys
  },
} as Partial<ExtendedHardhatConfig>;

export { tenderly, config };
