export * from "@nomiclabs/hardhat-ethers";
export * from "@nomiclabs/hardhat-etherscan";
export * from "hardhat-abi-exporter";
import * as tenderly from "@tenderly/hardhat-tenderly";
import * as dotenv from "dotenv";
import { INetwork } from "./types";
import { networks } from "./networks";
import { clearNetworkTypeFromSlug, toUpperSnake } from "./utils/format";

dotenv.config({ override: true });
tenderly.setup({ automaticVerifications: false });

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
        forking: {
          url: network.httpRpcs[0], // Mainnet URL to fork from
          // blockNumber: "latest"
        },
        chainId: Number(network.id),
        accounts,
      };
      // check for known tenderly fork (persistent) in .env in addition to the local fork
      const varname = `${slug}-tenderly-fork-id`;
      const forkId = process.env[varname];
      if (forkId) {
        // TODO: add support for devNet
        networks[`${slug}-tenderly`] = {
          network: `${slug}-tenderly`,
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
    artifacts: process.env.ARTIFACTS_DIR ?? "./artifacts",
    cache: process.env.CACHE_DIR ?? "./cache",
    sources: process.env.CONTRACTS_DIR ?? "./contracts",
    tests: process.env.CONTRACTS_TESTS_DIR ?? "./test/integration",
    registry: process.env.REGISTRY_DIR ?? "./registry",
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
  abiExporter: {
    path: (process.env.REGISTRY_DIR ?? "./registry") + "/abis",
    runOnCompile: true,
    clear: true,
    flat: true,
    // only: [':ERC20$'],
    spacing: 2,
    pretty: true,
    format: "json", // "minimal" "fullName"
    // filter: () => true,
  },
}; // as Partial<HardhatConfig>;

export { tenderly, config };
