import { EMPTY_STATE, type ServerState } from '../core/state.ts';

/** Where the Lambda keeps what it read from WSDOT between runs. */
export interface Store {
  loadState(): Promise<ServerState>;
  saveState(state: ServerState): Promise<void>;
  /** Keeps a raw copy of the page, for looking into problems */
  savePage(name: 'express-lanes.html' | 'unreadable.html', html: string): Promise<void>;
}

const STATE_KEY = 'state.json';

export class S3Store implements Store {
  private readonly bucket: string;
  private client: import('@aws-sdk/client-s3').S3Client | null = null;

  constructor(bucket: string) {
    this.bucket = bucket;
  }

  private async s3() {
    const sdk = await import('@aws-sdk/client-s3');
    this.client ??= new sdk.S3Client({});
    return { sdk, client: this.client };
  }

  async loadState(): Promise<ServerState> {
    const { sdk, client } = await this.s3();
    try {
      const res = await client.send(new sdk.GetObjectCommand({ Bucket: this.bucket, Key: STATE_KEY }));
      return { ...EMPTY_STATE, ...JSON.parse(await res.Body!.transformToString()) };
    } catch (e) {
      if ((e as { name?: string }).name === 'NoSuchKey') return EMPTY_STATE;
      throw e;
    }
  }

  async saveState(state: ServerState): Promise<void> {
    await this.put(STATE_KEY, JSON.stringify(state), 'application/json');
  }

  async savePage(name: string, html: string): Promise<void> {
    await this.put(name, html, 'text/html; charset=utf-8');
  }

  private async put(key: string, body: string, contentType: string) {
    const { sdk, client } = await this.s3();
    await client.send(new sdk.PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }
}

/** Keeps everything in memory, for tests and the local API */
export class MemoryStore implements Store {
  state: ServerState = EMPTY_STATE;
  pages = new Map<string, string>();

  async loadState() {
    return this.state;
  }

  async saveState(state: ServerState) {
    this.state = state;
  }

  async savePage(name: string, html: string) {
    this.pages.set(name, html);
  }
}
