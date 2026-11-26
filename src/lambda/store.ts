// Imported up front, so a cold start loads the SDK during Lambda's init, which gets more CPU
// than the first request does
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
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
  private readonly client = new S3Client({});

  constructor(bucket: string) {
    this.bucket = bucket;
  }

  async loadState(): Promise<ServerState> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: STATE_KEY }));
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
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
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
