import { INetwork } from "./types";
const sfetch = require('sync-fetch')

let networks: INetwork[] = [];
let [networkById, networkBySlug] = [{}, {}] as [{ [id: number]: INetwork }, { [slug: string]: INetwork }];

function loadNetworks() {
  try {
    networks = sfetch('https://cdn.astrolab.fi/data/networks.json').json(); // always updated
  } catch (e) {
    console.error('Failed to fetch networks from astrolab static server', e);
    networks = require('../networks.json');
  }
  networks.forEach(n => n.id = Number(n.id));
  [networkById, networkBySlug] = networks.reduce((acc, network) => {
    [acc[0][network.id], acc[1][network.slug]] = [network, network];
    return acc;
  }, [{}, {}] as [{ [id: number]: INetwork }, { [slug: string]: INetwork }]);
  return networks;
}

const getNetwork = (network: INetwork|string|number): INetwork =>
  typeof network === 'string' ? networkBySlug[network]
    : typeof network === 'number' ? networkById[network]
      : network;

loadNetworks();

export {
  networks,
  networkById,
  networkBySlug,
  getNetwork,
}
