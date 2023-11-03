import { INetwork } from "./types";

const networks: INetwork[] = require('./_networks.json');
networks.forEach(n => n.id = Number(n.id));

const [networkById, networkBySlug] = networks.reduce((acc, network) => {
    [acc[0][network.id], acc[1][network.slug]] = [network, network];
    return acc;
}, [{}, {}] as [{ [id: number]: INetwork }, { [slug: string]: INetwork }]);

const getNetwork = (network: INetwork|string|number): INetwork =>
  typeof network === 'string' ? networkBySlug[network]
    : typeof network === 'number' ? networkById[network]
      : network;

export {
    networks,
    networkById,
    networkBySlug,
    getNetwork,
}
