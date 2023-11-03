import { BigNumber, Contract, Signer } from "ethers";
import { ethers, tenderly, run } from "hardhat";
import { Network } from "hardhat/types";
import { IDeployable, INetwork } from "../types";
import { getNetwork } from "../networks";
// import { isAlreadyVerified } from "@nomiclabs/hardhat-etherscan/dist/etherscan/EtherscanService";


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
  target: INetwork | string | number,
  blockNumber?: number
) {
  target = getNetwork(target);
  await network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: target.httpRpcs[0],
          networkId: target.id,
          ...(blockNumber && { blockNumber }), // <-- latest by default
        },
      },
    ],
  });
}

export async function deploy(d: IDeployable): Promise<Contract> {
  d.deployer ??= (await ethers.getSigners())[0] as Signer;
  const factory = await ethers.getContractFactory(d.name, d.deployer);
  const contract = (await (d.args
    ? factory.deploy(d.args)
    : factory.deploy())) as any;
  await contract.deployed?.();
  contract.target ??= contract.address;
  contract.address ??= contract.target;
  // NB: below is only useful if tenderly is setup with automaticVerification=false
  // if (d.verify) {
  // await tenderly.verify({
  //   name,
  //   address: contract.target as string,
  //   libraries: {}
  // });
  // }
  return contract;
}

// async function isVerified(
//   apiURL: string,
//   apiKey: string,
//   address: string
// ): Promise<boolean> {
//   return await isAlreadyVerified(apiURL, apiKey, address);
// }

// cf. https://hardhat.org/hardhat-runner/plugins/nomicfoundation-hardhat-verify
export const verify = async (address: string, constructorArguments=[]) =>
  await run("verify:verify", {
    address,
    constructorArguments,
  });
