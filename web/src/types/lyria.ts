export interface AudioChunk {
  data: string; 
}

export interface LyriaServerContent {
  audioChunks?: AudioChunk[];
}

export interface LyriaMessage {
  serverContent?: LyriaServerContent;
}

export type ServiceStatus = 'idle' | 'connecting' | 'playing' | 'error';