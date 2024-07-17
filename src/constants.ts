import { ethers } from "ethers";
const sfetch = require('sync-fetch');

const [CDN_URL, REGISTRY_URL] = ["https://cdn.astrolab.fi", "https://registry.astrolab.fi"];

const SALTS_URL = `${CDN_URL}/data/salts.json`;
const NETWORKS_URL = `${CDN_URL}/data/networks.json`;
const ADDRESSES_URL = `${CDN_URL}/data/addresses-by-chain.json`;
const REGISTRY_LATEST_URL = `${REGISTRY_URL}/deployments/_latest.json`;
const CHAINLINK_FEEDS_URL = `${CDN_URL}/data/chainlink-feeds-by-chain.json`;
const PYTH_FEEDS_URL = `${CDN_URL}/data/pyth-feeds.json`;
const ERC20_ABI = sfetch(`${REGISTRY_URL}/abis/Erc20.json`).json()?.abi;
const WETH_ABI = sfetch(`${REGISTRY_URL}/abis/Weth.json`).json()?.abi;
const addressZero = "0x0000000000000000000000000000000000000000";
const addressOne = "0x0000000000000000000000000000000000000001";
const { MaxUint256, MaxInt256, MinInt256 } = ethers.constants;
export const keccak256 = (s: string) => ethers.utils.keccak256(ethers.utils.toUtf8Bytes(s));

export {
    SALTS_URL,
    NETWORKS_URL,
    ADDRESSES_URL,
    REGISTRY_LATEST_URL,
    CHAINLINK_FEEDS_URL,
    PYTH_FEEDS_URL,
    ERC20_ABI,
    WETH_ABI,
    addressZero,
    addressOne,
    MaxUint256,
    MaxInt256,
    MinInt256,
}
