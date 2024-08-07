export * from "@nomiclabs/hardhat-ethers";
export * from "@nomiclabs/hardhat-etherscan";
export * from "@nomicfoundation/hardhat-network-helpers";
import * as tenderly from "@tenderly/hardhat-tenderly";
import * as dotenv from "dotenv";
import { HardhatConfig, NetworksConfig, ProjectPathsConfig, SolidityConfig } from "hardhat/types";

import { INetwork } from "./src/types";
import { networks } from "./src/networks";
import { clearNetworkTypeFromSlug } from "./src/utils/format";
import tenderlySlugByChainId from "./tenderly-slug-by-id.json";

dotenv.config({ override: true });
tenderly.setup({ automaticVerifications: true });

const [mnemonic, pkeys] = [process.env?.TEST_MNEMONIC, process.env?.TEST_PKEYS?.split(",")];
if (!mnemonic && !pkeys) {
  throw new Error("No test mnemonic or private keys found in the environment");
}
const tenderlyMode = process.env.TENDERLY_MODE ?? "fork"; // fork, testnet, devnet
process.env.REGISTRY_DIR ??= "./registry";

const accounts = mnemonic ? { mnemonic } : pkeys;
// path: "m/44'/60'/0'/0",
// initialIndex: 0,
// count: 20,

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
    const chainId = Number(network.id);
    const mainRpc = process.env[`${slug}-private-rpc`] || network.httpRpcs[0];
    // combination of hh network and scan customChain objects for reusability
    networks[network.slug] = {
      network: network.slug,
      url: mainRpc,
      urls: {
        apiURL: network.explorerApi?.replace(
          "{key}",
          process.env[`${slug}-scan-api-key`] ?? ""
        ),
        browserURL: network.explorers![0],
      },
      chainId,
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
            url: process.env.HARDHAT_FORK_URL || mainRpc, // if fork is missing, use the selected mainnet default rpc to fork from
          },
          port: process.env.HARDHAT_PORT || 8545,
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
        let tenderlyChainSlug = (<any>tenderlySlugByChainId)[network.id.toString()] ?? slug;
        networks[`tenderly`] = {
          network: `tenderly`,
          url: tenderlyMode == "fork" ? `https://rpc.tenderly.co/fork/${forkId}` : `https://virtual.${tenderlyChainSlug}.rpc.tenderly.co/${forkId}`,
          urls: {
            apiURL: "", // https://api.tenderly.co/api/v1/account/${process.env.TENDERLY_USER}/project/${process.env.TENDERLY_PROJECT}
            browserURL: tenderlyMode == "fork" ? `https://dashboard.tenderly.co/shared/fork/${forkId}/transactions` : `https://dashboard.tenderly.co/explorer/vnet/${forkId}/transactions`,
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
      version: "0.8.22",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200,
        },
        viaIR: false,
        evmVersion: "paris",
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
export default config;
