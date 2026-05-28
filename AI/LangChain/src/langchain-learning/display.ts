export function printTitle(title: string): void {
  console.log(`\n${"=".repeat(72)}`);
  console.log(title);
  console.log("=".repeat(72));
}

export function printMessage(label: string, content: string): void {
  console.log(`\n[${label}]`);
  console.log(content);
}

type StreamChunk = string | { content: unknown };

export async function printStream(chunks: AsyncIterable<StreamChunk>): Promise<void> {
  process.stdout.write("\n[assistant stream]\n");

  for await (const chunk of chunks) {
    const content = typeof chunk === "string" ? chunk : chunk.content;
    if (typeof content === "string" && content.length > 0) {
      process.stdout.write(content);
    }
  }

  process.stdout.write("\n");
}
