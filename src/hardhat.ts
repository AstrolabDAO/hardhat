import { NonceManager } from "@ethersproject/experimental";
import { setup as tenderlySetup } from "@tenderly/hardhat-tenderly";
import { BigNumber, Contract, ContractInterface, Overrides, Signer } from "ethers";
import { artifacts, ethers, network, run, tenderly } from "hardhat";
import { EthereumProvider, HttpNetworkConfig } from "hardhat/types";
import { EthersProviderWrapper } from "@nomiclabs/hardhat-ethers/internal/ethers-provider-wrapper";
import { createProvider } from "hardhat/internal/core/providers/construction";
import { Provider as MulticallProvider } from "ethcall";
const sfetch = require('sync-fetch')

import { config } from "../hardhat.config";
import { networkById, networkBySlug } from "./networks";
import { Addresses, IArtifact, IDeployment, IDeploymentUnit, INetwork, IVerifiable, NetworkAddresses, SignerWithAddress } from "./types";
import { abiFragmentSignature, nowEpochUtc, slugify } from "./utils/format";
import { getLatestFileName, loadJson, loadLatestJson, saveJson } from "./utils/fs";
import { addressZero, REGISTRY_LATEST_URL, SALTS_URL, WETH_ABI } from "./constants";
import { isLive, getChainlinkFeedsByChainId, isDeployed, isVerified, isTenderly, isLocal } from "./utils";
import addresses, { ITestEnv, SafeContract } from "./addresses";
import merge from "lodash/merge";


let salts: any;
export function getSalts() {
  if (!salts) {
    salts = sfetch(SALTS_URL).json();
  }
  return salts;
}

let registryLatest: any;
export function getRegistryLatest() {
  if (!registryLatest) {
    registryLatest = sfetch(REGISTRY_LATEST_URL).json();
  }
  return registryLatest;
}

const providers: { [name: string]: EthereumProvider } = {};

const getProvider = async (name: string): Promise<EthereumProvider> => {
  if (!providers[name]) {
    providers[name] = await createProvider(config as any, name, artifacts);
  }
  return providers[name];
};

export const getDeployer = async (): Promise<Signer> =>
  (await ethers.getSigners())[0];

export async function changeNetwork(slug: string, blockNumber?: number) {
  if (slug.includes("local"))
    return await resetLocalNetwork(slug, "hardhat", blockNumber);

  if (!config.networks![slug])
    throw new Error(`changeNetwork: Couldn't find network '${slug}'`);

  if (!providers[network.name]) providers[network.name] = network.provider;

  network.name = slug;
  network.config = config.networks![slug];
  network.provider = await getProvider(slug);

  ethers.provider = new EthersProviderWrapper(network.provider);

  if (slug.includes("tenderly")) tenderlySetup();
}

export const revertNetwork = async (snapshotId: any) =>
  await network.provider.send("evm_revert", [snapshotId]);

export const setBalances = async (
  amount: BigNumber | number | string,
  ...addresses: string[]
) => {
  const hexAmount = ethers.utils.hexValue(BigNumber.from(amount));
  network.name.includes("tenderly")
    ? await ethers.provider.send("tenderly_setBalance", [addresses, hexAmount])
    : await Promise.all(
      addresses.map((a) =>
        ethers.provider.send("hardhat_setBalance", [a, hexAmount])
      )
    );
};

export async function resetLocalNetwork(
  slug: string,
  name = "hardhat",
  blockNumber?: number
) {
  const target = config.networks![slug] as HttpNetworkConfig;
  if (!target)
    throw new Error(`resetLocalNetwork: Couldn't find network '${slug}'`);
  await network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        network: name,
        url: target.url,
        port: process.env.HARDHAT_PORT ?? 8545,
        chainId: Number(network.config.chainId),
        // accounts,
        forking: {
          jsonRpcUrl: target.url,
          networkId: target.chainId,
          ...(blockNumber && { blockNumber }), // <-- latest by default
        },
      },
    ],
  });
}

export async function deployAll(
  d: IDeployment,
  update = false
): Promise<IDeployment> {
  if (!d.name) throw new Error(`Missing name for deployment`);

  if (d.local === undefined) {
    d.local = isLocal();
    for (const u of Object.values(d.units ?? {})) u.local = d.local;
  }

  if (!d.units || !Object.values(d.units).length) {
    return await deployAll(
      {
        name: `${d.name}-standalone`,
        contract: d.contract,
        units: { [d.name]: d },
      },
      update
    );
  }

  // only export if any unit is missing an address >> actual deployment
  d.export ??= Object.values(d.units).some((u) => !u.address);

  for (const u of Object.values(d.units)) {
    u.deployer ??= d.deployer ?? d.provider;
    u.chainId ??= d.chainId;
    u.local ??= d.local;
    const contract = await deploy(u);
  }

  for (const attr of ["verified", "exported", "deployed"])
    if (Object.values(d.units).every((u) => (u as any)[attr]))
      (d as any)[attr] = true;

  if (!d.deployer) d.deployer = Object.values(d.units)[0].deployer;

  if (d.export) {
    saveDeployment(d, update);
    saveLightDeployment(d, update);
  }
  return d;
}

export const getArtifacts = async (
  d: IDeploymentUnit | string
): Promise<IArtifact | undefined> => {
  // const basename = path.split("/").pop();
  // return loadJson(`${config.paths!.artifacts}/${path}.sol/${basename}.json`);
  const contract = typeof d === "string" ? d : d.contract;
  return await artifacts.readArtifact(contract);
};

export const isContractLocal = async (
  d: IDeploymentUnit | string
): Promise<boolean> =>
  /^(src|\.\/src|contracts|\.\/contracts)/.test(await getArtifactSource(d));

export const getArtifactSource = async (
  d: IDeploymentUnit | string
): Promise<string> => (await getArtifacts(d))?.sourceName ?? "";

export const getAbiFromArtifacts = async (
  path: string
): Promise<any[] | undefined> => (await getArtifacts(path))?.abi;

export const exportAbi = async (d: IDeploymentUnit): Promise<boolean> => {
  const outputPath = `abis/${d.contract}.json`;
  const proxyAbi = await getAbiFromArtifacts(d.contract!);
  if (!proxyAbi) {
    console.error(
      `Failed to export ABI found for ${d.name} [${d.contract}.sol]: ABI not found in artifacts`
    );
    return false;
  }
  const abiSignatures = new Set(proxyAbi.map(abiFragmentSignature));

  if (d.proxied?.length) {
    for (const p of d.proxied) {
      const implAbi = await loadAbi(p) as unknown[];
      if (!implAbi) {
        console.error(
          `Proxy ABI error: ${p} implementation ABI not found - skipping`
        );
        continue;
      }

      for (const fragment of implAbi) {
        const signature = abiFragmentSignature(fragment);
        if (!abiSignatures.has(signature)) {
          abiSignatures.add(signature);
          proxyAbi.push(fragment);
        }
      }
    }
  }

  if (saveJson(`${config.paths!.registry}/${outputPath}`, { abi: proxyAbi })) {
    console.log(
      `Exported ABI for ${d.name} [${d.contract}.sol] to ${config.paths!.registry
      }/${outputPath}`
    );
    return true;
  }
  console.error(
    `Failed to export ABI for ${d.name} [${d.contract}.sol] to ${config.paths!.registry
    }/${outputPath}`
  );
  return false;
};

export async function deploy(d: IDeploymentUnit): Promise<Contract> {
  d.deployer ??= (await ethers.getSigners())[0] as Signer;
  d.chainId ??= network.config.chainId;

  if (d.local === undefined) d.local = isLocal();

  let contract: Contract;

  if (d.address) d.deployed = true;

  const abi = (await loadAbi(d.contract) as any[]) ?? [];
  if (d.address && await isDeployed(d.address)) {
    d.deployed = true;
  }
  if (d.deployed) {
    if (!d.address)
      throw new Error(
        `Deployment of ${d.name} rejected: marked deployed but no address provided`
      );
    console.log(
      `Skipping deployment of ${d.name} [${d.contract
      }.sol]: already deployed at ${d.chainId}:${d.address ?? "???"}`
    );
    contract = new Contract(d.address, abi, d.deployer);
  } else {
    const chainSlug = network.name;
    d.name ||= generateContractName(d.contract, [], d.chainId);
    console.log(`Deploying ${d.name} [${d.contract}.sol] on ${chainSlug}...`);
    const params = { deployer: d.deployer } as any;
    if (d.libraries) params.libraries = d.libraries;

    try {
      const overrides = d.overrides ?? {};
      if (overrides.nonce) {
        const nonceManager =
          d.deployer instanceof NonceManager
            ? d.deployer
            : new NonceManager(d.deployer);
        const txCount = await nonceManager.getTransactionCount();
        nonceManager.incrementTransactionCount(
          Number(overrides.nonce.toString()) - txCount
        );
        params.signer = nonceManager;
      }
      const factory = d.create3Bytecode ? null : await ethers.getContractFactory(d.contract, params);
      const args = (
        d.args ? (d.args instanceof Array ? d.args : [d.args]) : undefined
      ) as any[];
      const hasArgs = args && args.length > 0;

      if (d.useCreate3) {
        if (!d.create3Salt)
          throw new Error(`Missing salt for Create3 deployment`);

        const c3deployer = new ethers.Contract(
          networkById[d.chainId!].create3Deployer!,
          [
            "function deployCreate3(bytes32,bytes) external returns (address)",
            "function computeCreate3Address(bytes32) view returns (address)",
            "function computeCreate3Address(bytes32,address) view returns (address)",
          ],
          d.deployer
        );

        let salt;
        switch (d.create3Salt.length) {
          case 32: salt = ethers.utils.toUtf8Bytes(d.create3Salt); break;
          case 64: salt = ethers.utils.arrayify(`0x${d.create3Salt}`); break;
          case 66: salt = ethers.utils.arrayify(d.create3Salt); break;
          default:
            throw new Error(`Invalid salt length: ${d.create3Salt.length}`);
        }

        const constructorTypes = hasArgs
          ? abi.find((frag: any) => frag.type === "constructor")?.inputs
          : [];
        let linkedBytecode = d.create3Bytecode ?? factory?.bytecode;
        if (!linkedBytecode)
          throw new Error(`Missing bytecode for Create3 deployment`);
        if (d.libraries && Object.keys(d.libraries).length > 0) {
          for (const [libName, libAddress] of Object.entries(d.libraries)) {
            const regex = new RegExp(`__${libName}_+`, "g");
            linkedBytecode = linkedBytecode.replace(
              regex,
              libAddress.replace("0x", "")
            );
          }
        }
        const creationCode = ethers.utils.solidityPack(
          ["bytes", "bytes"],
          [
            linkedBytecode,
            ethers.utils.defaultAbiCoder.encode(constructorTypes, args ?? []),
          ]
        );

        const receipt = await c3deployer
          .deployCreate3(salt, creationCode, overrides)
          .then((tx: any) => tx.wait());
        const eventData = receipt.events.slice(-1)[0].topics.slice(-1)[0];
        const deployedAddress = "0x" + eventData.slice(26);
        contract = new Contract(deployedAddress, abi, d.deployer);
        (<any>contract).deployTransaction = receipt;
      } else {
        contract = (await (hasArgs
          ? factory!.deploy(...args, overrides)
          : factory!.deploy(overrides))) as Contract;
        await contract.deployed?.();
      }
      (<any>contract).target ??= contract.address;
      (<any>contract).address ??= contract.target;
      d.address = contract.address;
      if (!d.address) throw new Error(`no address returned`);
      d.tx =
        contract.deployTransaction?.hash ??
        (contract.deployTransaction as any)?.transactionHash;
      d.export ??= true;
      const isLocal = await isContractLocal(d);
      if (!isLocal)
        console.log(`${d.name} is a foreign contract - not exporting ABI`);
      if (d.export && isLocal) d.exported = await exportAbi(d);
    } catch (e) {
      d.deployed = false;
      console.error(`Deployment of ${d.name} failed: ${e}`);
      throw e;
    }
    console.log(`Successfully deployed ${d.name} at ${d.address} ✅`);
  }
  d.verify ??= true;
  if (d.verify && !d.verified && !d.local) {
    try {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      const ok = await verifyContract(d);
      d.verified = true;
    } catch (e) {
      d.verified = false;
      console.log(`Verification failed for ${d.name}: ${e}`);
    }
  }
  d.deployed = true;
  return contract;
}

export const loadDeployment = (d: IDeployment): IDeployment =>
  loadLatestJson(config.paths!.registry, d.name) as IDeployment;

export const loadAbi = async (name: string): Promise<ContractInterface> =>
  loadJson(`${config.paths!.registry}/abis/${name}.json`)?.abi ?? await getAbiFromArtifacts(name) ?? [];

// loads a single contract deployment unit
export const loadDeploymentUnit = (
  d: IDeployment,
  name: string
): IDeploymentUnit | undefined => loadDeployment(d)?.units?.[name];

export const getDeployedContract = async (d: IDeployment, name: string): Promise<Contract> => {
  const u = loadDeploymentUnit(d, name)!;
  if (!u?.contract) throw new Error(`${d.slug}[${u.slug}] missing contract`);
  const deployer = u.deployer ?? u.provider ?? d.deployer ?? d.provider;
  if (!u.address || !deployer)
    throw new Error(
      `${d.slug}[${u.slug}] missing address, contract, abi or deployer`
    );
  const abi = await loadAbi(u.contract);
  if (!abi) throw new Error(`${d.slug}[${u.slug}] missing ABI`);
  return new Contract(u.address, abi, deployer);
};

export const getDeployedAddress = (
  d: IDeployment,
  name: string
): string | undefined => loadDeploymentUnit(d, name)?.address;

export const saveDeployment = (
  d: IDeployment,
  update = true,
  light = false
) => {
  const basename = slugify(d.name) + (light ? "-light" : "");
  const prevFilename = update
    ? getLatestFileName(`${config.paths!.registry}/deployments`, basename)
    : undefined;
  const filename = prevFilename ?? `${basename}-${nowEpochUtc()}.json`;
  const path = `${config.paths!.registry}/deployments/${filename}`;
  const toSave = {
    name: d.name,
    version: d.version,
    chainId: d.chainId,
    units: {},
    ...(!light && {
      slug: d.slug ?? slugify(d.name!),
      verified: d.verified,
      exported: d.exported,
      local: d.local,
      deployer: (d.deployer as any)!.address,
    }),
  };
  if (d.units) {
    for (const k of Object.keys(d.units)) {
      const u = d.units[k];
      (toSave.units as any)![k] = {
        contract: u.contract,
        address: u.address,
        chainId: u.chainId ?? d.chainId,
        ...(!light && {
          slug: u.slug ?? slugify(u.name!),
          local: u.local ?? d.local,
          tx: u.tx,
          deployer: ((u.deployer ?? d.deployer) as any).address,
          exported: u.exported,
          verified: u.verified,
          args: u.args,
          libraries: u.libraries,
        }),
      };
    }
  }
  saveJson(path, toSave);
  console.log(
    `${prevFilename ? "Updated" : "Saved"} ${light ? "light " : ""}deployment ${config.paths!.registry
    }/deployments/${filename}`
  );
};

export const saveLightDeployment = (d: IDeployment, update = true) =>
  saveDeployment(d, update, true);

export const writeRegistry = saveDeployment;
export const writeLightRegistry = saveLightDeployment;

export const saveDeploymentUnit = (
  d: IDeployment,
  u: IDeploymentUnit,
  update = true
) => {
  const deployment = loadDeployment(d);
  if (deployment.units) {
    deployment.units[u.name!] = u;
  } else {
    deployment.units = { [u.name!]: u };
  }
  saveDeployment(deployment, update);
  saveLightDeployment(deployment, update);
};

export const generateContractName = (
  contract: string,
  assets: string[],
  chainId?: number
): string =>
  `${contract} ${assets.join("-")}${chainId ? ` ${networkById[chainId].name}` : ""
  }`;

export async function verifyContract(d: IDeploymentUnit) {
  if (!d?.address)
    throw new Error(
      `Cannot verify contract ${d?.name ?? "?"
      }: no address provided - check if contract was deployed`
    );

  if (d.local) {
    console.log("Skipping verification for local deployment");
    return;
  }

  if (d.verified || (!isTenderly() && await isVerified(d.address))) {
    console.log(`Skipping verification for ${d.name}: already verified`);
    return;
  }

  const args: IVerifiable = {
    name: d.contract,
    address: d.address,
  };

  if (d.args) args.constructorArguments = d.args;

  if (d.libraries) {
    const libraries: Record<string, string> = {};
    // replace solc-style library paths with names for verification
    for (const [path, address] of Object.entries(d.libraries)) {
      const tokens = path.split(":");
      const name = tokens[tokens.length - 1];
      libraries[name] = address;
    }
    args.libraries = libraries;
  }

  if (network.name.includes("tenderly")) {
    await tenderly.verify(args);
    console.log("Contract verified on Tenderly ✅");
  } else {
    if (!networkById[d.chainId!].explorerApi)
      throw new Error(
        `Cannot verify contract ${d.name}: no explorer API provided for network ${d.chainId}`
      );

    console.log(
      `Verifying ${d.name} on ${networkById[d.chainId!].explorerApi}...`
    );
    await run("verify:verify", args);
    console.log("Contract verified on explorer ✅");
  }
  d.verified = true;
  return true;
}

/**
 * Retrieves the signature of the initialization function for a given contract
 * @param contract - Contract address or name
 * @returns The signature of the initialization function
 */
export const getInitSignature = async (contract: string) => {
  const fragments = (await loadAbi(contract) as any[]).filter(
    a => a.name === "init",
  );
  const dummy = new Contract(addressZero, fragments, ethers.provider!);
  return Object.keys(dummy)
    .filter((s) => s.startsWith("init"))
    .sort((s1, s2) => s2.length - s1.length)?.[0];
};

/**
 * Completes the given strategy deployment environment
 * @param env - Strategy deployment environment
 * @param addressesOverride - Optional addresses override
 * @returns Completed strategy deployment environment
 */
export const getEnv = async (
  env: Partial<ITestEnv> = {},
  addressesOverride?: Addresses,
): Promise<ITestEnv> => {
  const addr = (addressesOverride ?? addresses)[network.config.chainId!];
  const oracles = (<any>getChainlinkFeedsByChainId())[network.config.chainId!];
  const deployer = await getDeployer() as SignerWithAddress;
  const multicallProvider = new MulticallProvider();
  await multicallProvider.init(ethers.provider);
  const live = isLive(env);
  if (live) env.revertState = false;
  let snapshotId = 0;
  try {
    snapshotId = live ? 0 : await ethers.provider.send("evm_snapshot", []);
  } catch (e) {
    console.error(`Failed to snapshot: ${e}`);
  }
  env = merge(
    {
      network,
      blockNumber: await ethers.provider.getBlockNumber(),
      snapshotId,
      revertState: false,
      wgas: await SafeContract.build(addr.tokens.WGAS, WETH_ABI, env.deployer!),
      addresses: addr,
      oracles,
      deployer,
      provider: ethers.provider,
      multicallProvider,
      needsFunding: false,
      gasUsedForFunding: 0, // denominated in wgas decimal
    },
    env,
  );
  const rpc = (network.config as any)?.forking?.url ?? (network.config as any)?.url ?? "???";
  console.log(`Live: ${live}\nRpc: ${rpc}`);
  return env as ITestEnv;
};

// cf. https://github.com/hujw77/safe-dao-factory/blob/07ae58dc5b9c90e962fe0c436557843987ce448f/src/SafeDaoFactory.sol#L8
export async function deployMultisig(
  env: Partial<ITestEnv>,
  name: string = "Astrolab DAO Council",
  owners = [env.deployer!.address],
  threshold = 1,
  overrides: Overrides = {
    gasLimit: 2_500_000,
  },
): Promise<Contract> {
  const addr: NetworkAddresses = addresses![network.config.chainId!];
  const params = {
    owners,
    threshold,
    to: addressZero,
    data: "0x",
    fallbackHandler: addr.safe!.compatibilityFallbackHandler,
    paymentToken: addr.tokens.WGAS,
    payment: 0,
    paymentReceiver: addressZero,
  };
  const [proxyFactoryAbi, safeAbi] = await Promise.all([loadAbi("SafeProxyFactory"), loadAbi("Safe")]) as any;
  const proxyFactory = new Contract(addr.safe!.proxyFactory, proxyFactoryAbi, env.deployer!);
  const creationCode = await proxyFactory.proxyCreationCode();
  // const create3Bytecode = ethers.utils.hexConcat([
  //   creationCode,
  //   ethers.utils.defaultAbiCoder.encode(['address'], [addr.safe!.singletonL2]),
  // ]);
  const create3Bytecode = ethers.utils.solidityPack(
    ['bytes', 'uint256'],
    [creationCode, BigNumber.from(addr.safe!.singletonL2)],
  );
  const salts = getSalts();
  if (!salts[name]) {
    throw new Error("Salt not found for " + name);
  }
  let safe = await deploy({
    contract: "Safe", // proxy
    name,
    deployer: env.deployer!,
    overrides,
    useCreate3: true,
    create3Salt: salts[name],
    create3Bytecode,
  });
  safe = new Contract(safe.address, safeAbi, env.deployer!);
  await safe.setup(params);
  return safe;
}
