export interface INetwork {
  name?: string;
  slug: string;
  landing?: string;
  blockNumber?: number;
  id: number;
  lzId?: number;
  lzEndpoint?: string;
  defiLlamaId?: string;
  httpRpcs: string[];
  wsRpcs?: string[];
  explorers?: string[];
  explorerApi?: string;
}

export const networks: INetwork[] = [];

export const networkById = networks.reduce((acc, network) => {
    acc[network.id] = network;
    return acc;
}, {} as Record<string, INetwork>);

export const networkBySlug = networks.reduce((acc, network) => {
    acc[network.slug] = network;
    return acc;
}, {} as Record<string, INetwork>);

export const getNetwork = (network: INetwork|string|number): INetwork =>
  typeof network === 'string' ? networkBySlug[network]
    : typeof network === 'number' ? networkById[network]
      : network;

