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
