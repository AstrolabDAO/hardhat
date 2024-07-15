const SALTS_URL = "https://cdn.astrolab.fi/data/salts.json";
const NETWORKS_URL = "https://cdn.astrolab.fi/data/networks.json";
const ADDRESSES_URL = "https://cdn.astrolab.fi/data/addresses-by-chain.json";
const REGISTRY_LATEST_URL = "https://registry.astrolab.fi/deployments/_latest.json";
const ERC20_ABI = require('sync-fetch')("https://registry.astrolab.fi/abis/Erc20.json");

export {
    SALTS_URL,
    NETWORKS_URL,
    ADDRESSES_URL,
    REGISTRY_LATEST_URL,
    ERC20_ABI,
}
