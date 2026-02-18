import fs from "node:fs/promises";
import path from "node:path";

import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

import { getConfig } from "../config";
import type { StorageAdapter, StorageObject } from "./interfaces";

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export class S3StorageAdapter implements StorageAdapter {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const config = getConfig();
    if (!config.S3_BUCKET || !config.S3_ACCESS_KEY_ID || !config.S3_SECRET_ACCESS_KEY) {
      throw new Error("S3 adapter requires S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY");
    }
    this.bucket = config.S3_BUCKET;
    this.client = new S3Client({
      region: config.S3_REGION,
      endpoint: config.S3_ENDPOINT,
      forcePathStyle: Boolean(config.S3_ENDPOINT),
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY_ID,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY,
      },
    });
  }

  async putObject(input: {
    key: string;
    contentType: string;
    bytes: Buffer;
  }): Promise<string> {
    const uploader = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: input.key,
        Body: input.bytes,
        ContentType: input.contentType,
      },
    });
    await uploader.done();
    return input.key;
  }

  async getObject(key: string): Promise<StorageObject> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
    if (!response.Body) throw new Error(`Missing object body for key ${key}`);
    const bytes = await streamToBuffer(response.Body as NodeJS.ReadableStream);
    return {
      key,
      contentType: response.ContentType ?? "application/octet-stream",
      bytes,
    };
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }
}

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly basePath = path.resolve(process.cwd(), ".local-storage")) {}

  private resolvePath(key: string): string {
    return path.join(this.basePath, key);
  }

  async putObject(input: {
    key: string;
    contentType: string;
    bytes: Buffer;
  }): Promise<string> {
    const fullPath = this.resolvePath(input.key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, input.bytes);
    await fs.writeFile(`${fullPath}.meta.json`, JSON.stringify({ contentType: input.contentType }));
    return input.key;
  }

  async getObject(key: string): Promise<StorageObject> {
    const fullPath = this.resolvePath(key);
    const bytes = await fs.readFile(fullPath);
    const metadataRaw = await fs.readFile(`${fullPath}.meta.json`, "utf8").catch(() => "{}");
    const metadata = JSON.parse(metadataRaw) as { contentType?: string };
    return {
      key,
      contentType: metadata.contentType ?? "application/octet-stream",
      bytes,
    };
  }

  async deleteObject(key: string): Promise<void> {
    const fullPath = this.resolvePath(key);
    await fs.rm(fullPath, { force: true });
    await fs.rm(`${fullPath}.meta.json`, { force: true });
  }
}

