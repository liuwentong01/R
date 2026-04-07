import { promises as fs } from 'node:fs';
import path from 'node:path';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Config, HandlerMap } from '../types.js';

interface ListFilesParams {
  relativePath?: string;
  recursive?: boolean;
  maxDepth?: number;
}

interface ReadTextFileParams {
  relativePath?: string;
  startLine?: number;
  endLine?: number;
}

interface SearchInFilesParams {
  query?: string;
  relativePath?: string;
  fileExtensions?: string[];
  caseSensitive?: boolean;
  maxResults?: number;
  maxDepth?: number;
}

interface FileEntry {
  path: string;
  type: 'file' | 'directory';
  size: number;
}

interface SearchMatch {
  path: string;
  line: number;
  preview: string;
}

export const LIST_FILES_TOOL = {
  name: 'list_files',
  description: '列出根目录白名单内的文件和目录，可选递归，演示路径边界控制。',
  inputSchema: {
    type: 'object' as const,
    properties: {
      relativePath: {
        type: 'string',
        description: '相对根目录的路径，默认 .',
      },
      recursive: {
        type: 'boolean',
        description: '是否递归列出子目录',
      },
      maxDepth: {
        type: 'number',
        description: '递归时允许向下遍历的最大深度，默认 2',
      },
    },
  },
};

export const READ_TEXT_FILE_TOOL = {
  name: 'read_text_file',
  description: '读取根目录内的文本文件，可按行截取，适合演示只读文件工具。',
  inputSchema: {
    type: 'object' as const,
    properties: {
      relativePath: {
        type: 'string',
        description: '文件相对路径',
      },
      startLine: {
        type: 'number',
        description: '起始行，默认 1',
      },
      endLine: {
        type: 'number',
        description: '结束行，默认读到文件末尾',
      },
    },
    required: ['relativePath'],
  },
};

export const SEARCH_IN_FILES_TOOL = {
  name: 'search_in_files',
  description: '在根目录白名单内搜索文本文件内容，返回匹配的文件、行号和预览。',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: '要搜索的关键字',
      },
      relativePath: {
        type: 'string',
        description: '限定搜索的子目录，默认 .',
      },
      fileExtensions: {
        type: 'array',
        description: '只搜索指定后缀，例如 [\".ts\", \".md\"]',
        items: {
          type: 'string',
        },
      },
      caseSensitive: {
        type: 'boolean',
        description: '是否区分大小写',
      },
      maxResults: {
        type: 'number',
        description: '结果上限，默认使用服务配置',
      },
      maxDepth: {
        type: 'number',
        description: '最大搜索深度，默认 4',
      },
    },
    required: ['query'],
  },
};

export const ALL_TOOLS = [
  LIST_FILES_TOOL,
  READ_TEXT_FILE_TOOL,
  SEARCH_IN_FILES_TOOL,
];

export const HANDLER_MAP: HandlerMap = {
  [LIST_FILES_TOOL.name]: handleListFiles,
  [READ_TEXT_FILE_TOOL.name]: handleReadTextFile,
  [SEARCH_IN_FILES_TOOL.name]: handleSearchInFiles,
};

async function handleListFiles(
  params: ListFilesParams,
  config: Config,
): Promise<CallToolResult> {
  try {
    const targetPath = resolveSafePath(params.relativePath ?? '.', config.rootDir);
    const stat = await fs.stat(targetPath);

    if (!stat.isDirectory()) {
      return buildError('relativePath 必须指向目录');
    }

    const results: FileEntry[] = [];
    const recursive = params.recursive ?? false;
    const maxDepth = normalizeNonNegativeNumber(params.maxDepth, 2);

    await walkDirectory(
      targetPath,
      config,
      recursive,
      maxDepth,
      results,
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              rootDir: config.rootDir,
              requestedPath: path.relative(config.rootDir, targetPath) || '.',
              total: results.length,
              entries: results,
            },
            null,
            2,
          ),
        },
      ],
      isError: false,
    };
  } catch (error) {
    return buildError(error instanceof Error ? error.message : String(error));
  }
}

async function handleReadTextFile(
  params: ReadTextFileParams,
  config: Config,
): Promise<CallToolResult> {
  try {
    if (!params.relativePath?.trim()) {
      return buildError('relativePath 不能为空');
    }

    const targetPath = resolveSafePath(params.relativePath, config.rootDir);
    const stat = await fs.stat(targetPath);

    if (!stat.isFile()) {
      return buildError('relativePath 必须指向文件');
    }

    if (stat.size > config.maxFileSizeBytes) {
      return buildError(
        `文件过大，当前大小 ${stat.size} bytes，超过限制 ${config.maxFileSizeBytes} bytes`,
      );
    }

    const buffer = await fs.readFile(targetPath);
    ensureTextBuffer(buffer);

    const lines = buffer.toString('utf8').split(/\r?\n/);
    const startLine = Math.max(1, normalizeNonNegativeNumber(params.startLine, 1));
    const endLine = Math.min(
      lines.length,
      normalizeNonNegativeNumber(params.endLine, lines.length),
    );

    if (startLine > endLine) {
      return buildError('startLine 不能大于 endLine');
    }

    const snippet = lines
      .slice(startLine - 1, endLine)
      .map((line: string, index: number) => `${startLine + index}|${line}`)
      .join('\n');

    return {
      content: [
        {
          type: 'text',
          text: [
            `path: ${path.relative(config.rootDir, targetPath)}`,
            `totalLines: ${lines.length}`,
            `range: ${startLine}-${endLine}`,
            '',
            snippet || '(空文件)',
          ].join('\n'),
        },
      ],
      isError: false,
    };
  } catch (error) {
    return buildError(error instanceof Error ? error.message : String(error));
  }
}

async function handleSearchInFiles(
  params: SearchInFilesParams,
  config: Config,
): Promise<CallToolResult> {
  try {
    const query = params.query?.trim();

    if (!query) {
      return buildError('query 不能为空');
    }

    const rootPath = resolveSafePath(params.relativePath ?? '.', config.rootDir);
    const stat = await fs.stat(rootPath);

    if (!stat.isDirectory()) {
      return buildError('relativePath 必须指向目录');
    }

    const maxResults = Math.min(
      config.maxSearchResults,
      normalizeNonNegativeNumber(params.maxResults, config.maxSearchResults),
    );
    const maxDepth = normalizeNonNegativeNumber(params.maxDepth, 4);
    const caseSensitive = params.caseSensitive ?? false;
    const searchQuery = caseSensitive ? query : query.toLowerCase();
    const extensions = Array.isArray(params.fileExtensions)
      ? params.fileExtensions.map((item) => item.toLowerCase())
      : [];
    const results: SearchMatch[] = [];

    await searchDirectory(
      rootPath,
      config,
      {
        caseSensitive,
        extensions,
        maxDepth,
        maxResults,
        searchQuery,
      },
      results,
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              rootDir: config.rootDir,
              query,
              total: results.length,
              matches: results,
            },
            null,
            2,
          ),
        },
      ],
      isError: false,
    };
  } catch (error) {
    return buildError(error instanceof Error ? error.message : String(error));
  }
}

async function walkDirectory(
  currentPath: string,
  config: Config,
  recursive: boolean,
  depthRemaining: number,
  results: FileEntry[],
): Promise<void> {
  if (results.length >= config.maxDirectoryEntries) {
    return;
  }

  const entries = await fs.readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    if (results.length >= config.maxDirectoryEntries) {
      return;
    }

    const entryPath = path.join(currentPath, entry.name);
    const stat = await fs.stat(entryPath);

    results.push({
      path: toRelativeDisplayPath(entryPath, config.rootDir, entry.isDirectory()),
      type: entry.isDirectory() ? 'directory' : 'file',
      size: stat.size,
    });

    if (recursive && entry.isDirectory() && depthRemaining > 0) {
      await walkDirectory(
        entryPath,
        config,
        true,
        depthRemaining - 1,
        results,
      );
    }
  }
}

async function searchDirectory(
  currentPath: string,
  config: Config,
  options: {
    caseSensitive: boolean;
    extensions: string[];
    maxDepth: number;
    maxResults: number;
    searchQuery: string;
  },
  results: SearchMatch[],
  currentDepth = 0,
): Promise<void> {
  if (results.length >= options.maxResults || currentDepth > options.maxDepth) {
    return;
  }

  const entries = await fs.readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    if (results.length >= options.maxResults) {
      return;
    }

    const entryPath = path.join(currentPath, entry.name);

    if (entry.isDirectory()) {
      await searchDirectory(
        entryPath,
        config,
        options,
        results,
        currentDepth + 1,
      );
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (
      options.extensions.length > 0 &&
      !options.extensions.includes(path.extname(entry.name).toLowerCase())
    ) {
      continue;
    }

    const stat = await fs.stat(entryPath);
    if (stat.size > config.maxFileSizeBytes) {
      continue;
    }

    const buffer = await fs.readFile(entryPath);
    if (buffer.includes(0)) {
      continue;
    }

    const lines = buffer.toString('utf8').split(/\r?\n/);

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      const haystack = options.caseSensitive ? line : line.toLowerCase();

      if (!haystack.includes(options.searchQuery)) {
        continue;
      }

      results.push({
        path: path.relative(config.rootDir, entryPath),
        line: index + 1,
        preview: line.trim(),
      });

      if (results.length >= options.maxResults) {
        return;
      }
    }
  }
}

function resolveSafePath(relativePath: string, rootDir: string): string {
  const resolvedPath = path.resolve(rootDir, relativePath);
  const rootWithSep = `${rootDir}${path.sep}`;

  if (resolvedPath !== rootDir && !resolvedPath.startsWith(rootWithSep)) {
    throw new Error(
      `路径越界：${relativePath} 不在允许的根目录 ${rootDir} 内`,
    );
  }

  return resolvedPath;
}

function normalizeNonNegativeNumber(
  value: number | undefined,
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fallback;
  }

  return Math.floor(value);
}

function ensureTextBuffer(buffer: Buffer) {
  if (buffer.includes(0)) {
    throw new Error('目标文件包含二进制内容，当前工具只支持读取文本文件');
  }
}

function toRelativeDisplayPath(
  absolutePath: string,
  rootDir: string,
  isDirectory: boolean,
): string {
  const relativePath = path.relative(rootDir, absolutePath) || '.';
  return isDirectory ? `${relativePath}/` : relativePath;
}

function buildError(message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}
