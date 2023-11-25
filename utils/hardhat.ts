import { Interface } from "ethers/lib/utils";
import { BigNumber, Contract, ContractInterface, Signer } from "ethers";
import { ethers, run, network, artifacts, tenderly } from "hardhat";
import { Network, HttpNetworkConfig, EthereumProvider } from "hardhat/types";
import { setup as tenderlySetup } from "@tenderly/hardhat-tenderly";

import { IArtifact, IDeployment, IDeploymentUnit, INetwork, IVerifiable } from "../types";
import { config, setBalance } from "../hardhat.config";
import { getNetwork, networkById } from "../networks";
import { abiFragmentSignature, cloneDeep, nowEpochUtc } from "./format";
import { getLatestFileName, loadJson, loadLatestJson, saveJson } from "./fs";
import { createProvider } from "hardhat/internal/core/providers/construction";
import { EthersProviderWrapper } from "@nomiclabs/hardhat-ethers/internal/ethers-provider-wrapper";

const providers: { [name: string]: EthereumProvider } = {};

const getProvider = async (name: string): Promise<EthereumProvider> => {
  if (!providers[name]) {
    providers[name] = await createProvider(
      config as any,
      name,
      artifacts
    );
  }
  return providers[name];
};

export async function changeNetwork(slug: string, blockNumber?: number) {

  if (slug.includes("local"))
    return await resetLocalNetwork(slug, "hardhat", blockNumber);

  if (!config.networks![slug])
    throw new Error(`changeNetwork: Couldn't find network '${slug}'`);

  if (!providers[network.name])
    providers[network.name] = network.provider;

  network.name = slug;
  network.config = config.networks![slug];
  network.provider = await getProvider(slug);

  ethers.provider = new EthersProviderWrapper(network.provider);

  if (slug.includes("tenderly"))
    tenderlySetup();
}

export const getDeployer = async (): Promise<Signer> =>
  (await ethers.getSigners())[0];

export const revertNetwork = async (snapshotId: any) =>
  await network.provider.send("evm_revert", [snapshotId]);

export const setBalances = async (
  amount: BigNumber | number | string,
  ...addresses: string[]
) => {

  const hexAmount = BigNumber.from(amount).toHexString();
  (network.name.includes("tenderly")) ?
    await ethers.provider.send("tenderly_setBalance", [
      addresses,
      hexAmount
    ]) : await Promise.all(addresses.map(a =>
      ethers.provider.send("tenderly_setBalance", [
        a,
        hexAmount
      ])));
}

export async function resetLocalNetwork(
  slug: string,
  name="hardhat",
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

export async function deployAll(d: IDeployment, update=false): Promise<IDeployment> {
  if (!d.name)
    throw new Error(`Missing name for deployment`);
  if (!d.units || !Object.values(d.units).length) {
    return await deployAll({
      name: `${d.name}-standalone`,
      contract: d.contract,
      units: { [d.name]: d } }, update);
  }
  for (const u of Object.values(d.units)) {
    u.deployer ??= d.deployer ?? d.provider;
    u.chainId ??= d.chainId;
    u.local ??= d.local;
    const contract = await deploy(u);
  }

  for (const attr of ["verified", "exported", "deployed"])
    if (Object.values(d.units).every(u => (u as any)[attr]))
      (d as any)[attr] = true;

  if (!d.deployer)
    d.deployer = Object.values(d.units)[0].deployer;

  saveDeployment(d, update);
  saveLightDeployment(d, update);
  return d;
}

export const getArtifacts = async (d: IDeploymentUnit|string): Promise<IArtifact|undefined> => {
  // const basename = path.split("/").pop();
  // return loadJson(`${config.paths!.artifacts}/${path}.sol/${basename}.json`);
  const contract = typeof d === "string" ? d : d.contract;
  return await artifacts.readArtifact(contract);
}

export const isContractLocal = async (d: IDeploymentUnit|string): Promise<boolean> =>
  /^(src|\.\/src|contracts|\.\/contracts)/.test(await getArtifactSource(d));

export const getArtifactSource = async (d: IDeploymentUnit|string): Promise<string> =>
  (await getArtifacts(d))?.sourceName ?? "";

export const getAbiFromArtifacts = async (path: string): Promise<any[]|undefined> =>
  (await getArtifacts(path))?.abi;

export const exportAbi = async (d: IDeploymentUnit) => {

  const outputPath = `abis/${d.contract}.json`;
  const proxyAbi = await getAbiFromArtifacts(d.contract!);
  if (!proxyAbi)
    throw new Error(`No ABI found for ${d.name} [${d.contract}.sol]`);
  const abiSignatures = new Set(proxyAbi.map(abiFragmentSignature));

  if (d.proxied?.length) {

    for (const p of d.proxied) {

      const implAbi = loadAbi(p) as unknown[];
      if (!implAbi) {
        console.error(`Proxy ABI error: ${p} implementation ABI not found - skipping`);
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

  saveJson(`${config.paths!.registry}/${outputPath}`, { abi: proxyAbi });
  console.log(`Exported ABI for ${d.name} [${d.contract}.sol] to ${config.paths!.registry}/${outputPath}`);
}

export async function deploy(d: IDeploymentUnit): Promise<Contract> {

  d.deployer ??= (await ethers.getSigners())[0] as Signer;
  d.chainId ??= network.config.chainId;

  const chainSlug = networkById[d.chainId!].slug;
  d.name ||= `${d.contract}-${chainSlug}`;
  console.log(`Deploying ${d.name} [${d.contract}.sol] on ${networkById[d.chainId!].slug}...`);
  const params = { deployer: d.deployer } as any;
  if (d.libraries)
    params.libraries = d.libraries;

  try {
    const f = await ethers.getContractFactory(d.contract, params);
    const contract = (await (d.args
      ? ((d.args instanceof Array)
        ? f.deploy(...d.args): f.deploy(d.args))
      : f.deploy())) as Contract;

    await contract.deployed?.();
    (contract as any).target ??= contract.address;
    (contract as any).address ??= contract.target; // ethers v6 polyfill
    d.address = contract.address;
    if (!d.address)
      throw new Error(`Deployment of ${d.name} failed: no address returned`);
    d.tx = contract.deployTransaction.hash;
    d.export ??= true;
    const isLocal = await isContractLocal(d);
    if (!isLocal)
      console.log(`${d.name} is a foreign contract - not exporting ABI`);
    if (d.export && isLocal) {
      try {
        await exportAbi(d);
        d.exported = true;
      } catch (e) {
        d.exported = false;
        console.log(`Export failed for ${d.name}: ${e}`);
      }
    }
    d.verify ??= true;
    if (d.verify && !d.local) {
      try {
        const ok = await verifyContract(d);
        d.verified = true;
      } catch (e) {
        d.verified = false;
        console.log(`Verification failed for ${d.name}: ${e}`);
      }
    }
    d.deployed = true;
    return contract;
  } catch (e) {
    d.deployed = false;
    console.error(`Deployment of ${d.name} failed: ${e}`);
    throw e;
  }
}

export const loadDeployment = (d: IDeployment): IDeployment =>
  loadLatestJson(config.paths!.registry, d.name) as IDeployment;

export const loadAbi = (name: string): ContractInterface|undefined =>
  loadJson(`${config.paths!.registry}/abis/${name}.json`)?.abi;

// loads a single contract deployment unit
export const loadDeploymentUnit = (d: IDeployment, name: string): IDeploymentUnit|undefined =>
  loadDeployment(d)?.units?.[name];

export const getDeployedContract = (d: IDeployment, name: string): Contract => {
  const u = loadDeploymentUnit(d, name)!;
  if (!u?.contract) throw new Error(`${d.slug}[${u.slug}] missing contract`);
  const deployer = u.deployer ?? u.provider ?? d.deployer ?? d.provider;
  if (!u.address || !deployer)
    throw new Error(`${d.slug}[${u.slug}] missing address, contract, abi or deployer`);
  const abi = loadAbi(u.contract);
  if (!abi) throw new Error(`${d.slug}[${u.slug}] missing ABI`);
  return new Contract(u.address, abi, deployer);
}

export const getDeployedAddress = (d: IDeployment, name: string): string|undefined =>
  loadDeploymentUnit(d, name)?.address;

export const saveDeployment = (d: IDeployment, update=true, light=false) => {
  const basename = d.name + (light ? "-light" : "");
  const prevFilename = update ? getLatestFileName(`${config.paths!.registry}/deployments`, basename) : undefined;
  const filename = prevFilename ?? `${basename}-${nowEpochUtc()}.json`;
  const path = `${config.paths!.registry}/deployments/${filename}`;
  const toSave = {
    name: d.name,
    slug: d.slug,
    version: d.version,
    chainId: d.chainId,
    units: {},
    ...(!light && {
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
        name: u.name,
        slug: u.slug,
        contract: u.contract,
        address: u.address,
        chainId: u.chainId ?? d.chainId,
        ...(!light && {
          local: u.local ?? d.local,
          tx: u.tx,
          deployer: ((u.deployer ?? d.deployer) as any).address,
          exported: u.exported,
          verified: u.verified,
          args: u.args,
          libraries: u.libraries
        }),
      };
    }
  }
  saveJson(path, toSave);
  console.log(`${prevFilename ? 'Updated' : 'Saved'} ${light ? 'light ' : ''}deployment ${config.paths!.registry}/deployments/${filename}`);
}

export const saveLightDeployment = (d: IDeployment, update=true) => saveDeployment(d, update, true);

export const writeRegistry = saveDeployment;
export const writeLightRegistry = saveLightDeployment;

export const saveDeploymentUnit = (d: IDeployment, u: IDeploymentUnit, update=true) => {
  const deployment = loadDeployment(d);
  if (deployment.units) {
    deployment.units[u.name!] = u;
  } else {
    deployment.units = { [u.name!]: u };
  }
  saveDeployment(deployment, update);
  saveLightDeployment(deployment, update);
}

export const generateContractName = (
  contract: string,
  assets: string[],
  chainId?: number
): string => `${contract} ${assets.join("-")}${chainId ? ` ${networkById[chainId].name}` : ""}`;

export async function verifyContract(d: IDeploymentUnit) {

  if (!d?.address)
    throw new Error(`Cannot verify contract ${d?.name ?? '?'}: no address provided - check if contract was deployed`);

  if (d.local) {
    console.log("Skipping verification for local deployment");
    return;
  }

  const args: IVerifiable = {
    name: d.name,
    address: d.address,
  };

  if (d.args)
    args.constructorArguments = d.args;

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
      throw new Error(`Cannot verify contract ${d.name}: no explorer API provided for network ${d.chainId}`);

    console.log(`Verifying ${d.name} on ${networkById[d.chainId!].explorerApi}...`);
    await run("verify:verify", args);
    console.log("Contract verified on explorer ✅");
    }
  d.verified = true;
  return true;
}
