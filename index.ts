export * from "./src";

import { ethers, run, network, tenderly } from "hardhat";
import {
  Provider as MulticallProvider,
  Contract as MulticallContract,
  Call as Multicall,
  BlockTag as MulticallBlockTag,
} from "ethcall";
const provider = ethers.provider;
export {
  ethers,
  run,
  network,
  provider,
  tenderly,
  MulticallProvider,
  MulticallContract,
  Multicall,
  MulticallBlockTag,
};
