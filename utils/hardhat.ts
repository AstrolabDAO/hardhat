import { BigNumber, Contract, Signer } from "ethers";
import { ethers, tenderly, run } from "hardhat";
import { Network } from "hardhat/types";
import { IDeployment, IDeploymentUnit, INetwork } from "../types";
import { getNetwork, networkById } from "../networks";
import * as fs from "fs";
import { Interface } from "ethers/lib/utils";
import { cloneDeep, nowEpochUtc } from "./format";
import { getLatestFileName, loadLatestJson } from "./fs";
import { config } from "hardhat.config";

export const getDeployer = async (): Promise<Signer> =>
  (await ethers.getSigners())[0];

export const revertNetwork = async (network: Network, snapshotId: any) =>
  await network.provider.send("evm_revert", [snapshotId]);

export const setBalance = async (
  amount: BigNumber | number | string,
  ...addresses: string[]
) =>
  await ethers.provider.send("tenderly_setBalance", [
    addresses,
    BigNumber.from(amount).toHexString(), // wei
  ]);

export async function resetNetwork(
  network: Network,
  target: Network,
  blockNumber?: number
) {
  await network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: (<any>target.config).url!, // forking.url?
          networkId: target.config.chainId,
          ...(blockNumber && { blockNumber }), // <-- latest by default
        },
      },
    ],
  });
}

export async function deployAll(d: IDeployment): Promise<IDeployment> {
  if (!Object.values(d.units).length) {
    return await deployAll({
      name: `${d.name} Standalone`,
      units: { [d.name]: d } });
  }
  for (const u of Object.values(d.units)) {
    if (u.deployer) continue;
    u.chainId ??= d.chainId;
    u.local ??= d.local;
    const contract = await deploy(u);
  }
  if (Object.values(d.units).every((u) => u.verified))
    d.verified = true;
  await saveDeployment(d);
  return d;
}

export async function deploy(d: IDeploymentUnit): Promise<Contract> {
  d.deployer ??= (await ethers.getSigners())[0] as Signer;
  const factory = await ethers.getContractFactory(d.name, d.deployer);
  const contract = (await (d.args
    ? factory.deploy(d.args)
    : factory.deploy())) as Contract;
  await contract.deployed?.();
  (contract as any).target ??= contract.address;
  (contract as any).address ??= contract.target; // ethers v6 polyfill
  if (!d.address)
    throw new Error(`Deployment of ${d.name} failed`);
  d.address = contract.address;
  d.tx = contract.deployTransaction.hash;
  if (d.verify && !d.local) {
    try {
      await tenderly.verify({
        name: d.name,
        address: d.address!,
        libraries: d.libraries ?? {},
      });
      d.verified = true;
    } catch (e) {
      d.verified = false;
      console.log(`Verification failed for ${d.name}: ${e}`);
    }
  }
  return contract;
}

export const loadDeployment = (d: IDeployment): IDeployment =>
  loadLatestJson(config.paths.registry, d.name) as IDeployment;

export const loadAbi = (name: string): Interface =>
  JSON.parse(fs.readFileSync(`./abi/${name}.json`).toString()) as Interface;

// loads a single contract deployment unit
export const loadDeploymentUnit = (d: IDeployment, name: string): IDeploymentUnit|undefined =>
  loadDeployment(d)?.units[name];

export const getDeployedContract = (d: IDeployment, name: string): Contract => {
  const u = loadDeploymentUnit(d, name)!;
  if (!u?.contract) throw new Error(`${d.slug}[${u.slug}] missing contract`);
  const deployer = u.deployer ?? u.provider ?? d.deployer ?? d.provider;
  if (!u.address || !deployer)
    throw new Error(`${d.slug}[${u.slug}] missing address, contract, abi or deployer`);
  return new Contract(u.address, loadAbi(u.contract), deployer);
}

export const getDeployedAddress = (d: IDeployment, name: string): string|undefined =>
  loadDeploymentUnit(d, name)?.address;

export const saveDeployment = (d: IDeployment, update=true, light=false) => {
  const basename = d.name + (light ? "-light" : "");
  const filename = update ? getLatestFileName(config.paths.registry, basename) : `${basename}-${nowEpochUtc()}.json`;
  const path = `${config.paths.registry}/${filename}`;
  d = cloneDeep(d);
  if (light) {
    for (const k of Object.keys(d.units)) {
      const u = d.units[k];
      d.units[k] = { name: u.name, contract: u.contract, address: u.address };
    }
  }
  fs.writeFileSync(path, JSON.stringify(d));
}

export const saveLightDeployment = (d: IDeployment) => saveDeployment(d, true);

export const writeRegistry = saveDeployment;
export const writeLightRegistry = saveLightDeployment;

export const saveDeploymentUnit = (d: IDeployment, u: IDeploymentUnit) => {
  const deployment = loadDeployment(d);
  deployment.units[u.name] = u;
  saveDeployment(deployment);
  saveLightDeployment(deployment);
}

export const generateContractName = (
  contract: string,
  assets: string[],
  chainId?: number
): string => `${contract} ${assets.join("-")}${chainId ? ` ${networkById[chainId].name}` : ""}`;

export async function verifyContract(d: IDeployment, name: string) {

  const u = d.units[name];

  if (!u?.address)
    throw new Error(`Cannot verify contract ${u.name}: no address provided - check if contract was deployed`);

  if (u.local) {
    console.log("Skipping verification for local deployment");
    return;
  }

  if (!networkById[u.chainId!].explorerApi)
    throw new Error(`Cannot verify contract ${u.name}: no explorer API provided for network ${u.chainId}`);

  console.log(`Verifying ${u.name} on ${networkById[u.chainId!].explorerApi}...`);

  await run("verify:verify", {
    address: u.address,
    ...(u.libraries && { libraries: u.libraries }),
    ...(u.args && { constructorArguments: u.args } as any),
  });

  // We update the deployment file
  u.verified = true;
  if (Object.values(d.units).every((u) => u.verified))
    d.verified = true;
  await saveDeployment(d);

  console.log("Contract verified on explorer ✅");
}
