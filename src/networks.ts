import { INetwork } from "./types";

let networks: INetwork[];
let [networkById, networkBySlug] = [{}, {}] as [{ [id: number]: INetwork }, { [slug: string]: INetwork }];

async function loadNetworks() {
  try {
    const res = await fetch('https://assets.astrolab.fi/data/networks.json'); // always updated
    networkById = await res.json();
  } catch (e) {
    console.error('Failed to fetch networks from astrolab static server', e);
    networkById = require('../networks.json');
  }
  networks.forEach(n => n.id = Number(n.id));
  [networkById, networkBySlug] = networks.reduce((acc, network) => {
    [acc[0][network.id], acc[1][network.slug]] = [network, network];
    return acc;
  }, [{}, {}] as [{ [id: number]: INetwork }, { [slug: string]: INetwork }]);
  return networks;
}

const getNetwork = async (network: INetwork|string|number): Promise<INetwork> => {
  if (!networks?.length) {
    networks = await loadNetworks();
  }
  return typeof network === 'string' ? networkBySlug[network]
    : typeof network === 'number' ? networkById[network]
      : network;
}

(async () => await loadNetworks())();

export {
  networks,
  networkById,
  networkBySlug,
  getNetwork,
}
