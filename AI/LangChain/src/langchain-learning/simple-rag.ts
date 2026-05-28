import { Document } from "@langchain/core/documents";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export interface SplitOptions {
  chunkSize: number;
  chunkOverlap: number;
}

export interface RetrievedDocument {
  document: Document;
  score: number;
}

const DEFAULT_VECTOR_SIZE = 64;

export async function loadMarkdownFile(filePath: string): Promise<Document[]> {
  const content = await readFile(filePath, "utf8");

  return [
    new Document({
      pageContent: content,
      metadata: {
        source: path.basename(filePath),
        path: filePath,
      },
    }),
  ];
}

export async function loadMarkdownDirectory(directoryPath: string): Promise<Document[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(directoryPath, entry.name))
    .sort();

  const nested = await Promise.all(files.map((file) => loadMarkdownFile(file)));
  return nested.flat();
}

export function splitDocuments(documents: Document[], options: SplitOptions): Document[] {
  const chunks: Document[] = [];
  const step = Math.max(1, options.chunkSize - options.chunkOverlap);

  for (const document of documents) {
    for (let start = 0; start < document.pageContent.length; start += step) {
      const text = document.pageContent.slice(start, start + options.chunkSize).trim();
      if (!text) {
        continue;
      }

      chunks.push(
        new Document({
          pageContent: text,
          metadata: {
            ...document.metadata,
            chunkIndex: chunks.length,
            chunkStart: start,
            chunkSize: options.chunkSize,
          },
        }),
      );
    }
  }

  return chunks;
}

export class HashEmbeddings {
  constructor(private readonly vectorSize = DEFAULT_VECTOR_SIZE) {}

  embedQuery(text: string): number[] {
    return this.embed(text);
  }

  embedDocuments(texts: string[]): number[][] {
    return texts.map((text) => this.embed(text));
  }

  private embed(text: string): number[] {
    const vector = Array.from({ length: this.vectorSize }, () => 0);
    const tokens = tokenize(text);

    for (const token of tokens) {
      const index = hashToken(token) % this.vectorSize;
      vector[index] += 1;
    }

    return normalize(vector);
  }
}

export class SimpleVectorStore {
  private constructor(
    private readonly embeddings: HashEmbeddings,
    private readonly entries: Array<{ document: Document; vector: number[] }>,
  ) {}

  static fromDocuments(documents: Document[], embeddings = new HashEmbeddings()): SimpleVectorStore {
    const vectors = embeddings.embedDocuments(documents.map((document) => document.pageContent));
    const entries = documents.map((document, index) => ({
      document,
      vector: vectors[index],
    }));

    return new SimpleVectorStore(embeddings, entries);
  }

  similaritySearchWithScore(query: string, k = 3): RetrievedDocument[] {
    const queryVector = this.embeddings.embedQuery(query);

    return this.entries
      .map((entry) => ({
        document: entry.document,
        score: cosineSimilarity(queryVector, entry.vector),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, k);
  }

  asRetriever(k = 3): { invoke: (query: string) => Promise<Document[]> } {
    return {
      invoke: async (query: string) =>
        this.similaritySearchWithScore(query, k).map((result) => result.document),
    };
  }
}

export function formatDocumentsWithSources(documents: Document[]): string {
  return documents
    .map((document, index) => {
      const source = String(document.metadata.source ?? "unknown");
      return `[${index + 1}] source=${source}\n${document.pageContent}`;
    })
    .join("\n\n");
}

export function formatSourceList(documents: Document[]): string {
  return documents
    .map((document, index) => {
      const source = String(document.metadata.source ?? "unknown");
      const chunkIndex = String(document.metadata.chunkIndex ?? "?");
      return `${index + 1}. ${source}#chunk-${chunkIndex}`;
    })
    .join("\n");
}

function tokenize(text: string): string[] {
  const normalized = text.toLowerCase();
  const words = normalized.match(/[a-z0-9]+|[\u4e00-\u9fa5]{1,2}/g);
  return words ?? [];
}

function hashToken(token: string): number {
  let hash = 0;
  for (const char of token) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function normalize(vector: number[]): number[] {
  const length = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (length === 0) {
    return vector;
  }
  return vector.map((value) => value / length);
}

function cosineSimilarity(left: number[], right: number[]): number {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}
