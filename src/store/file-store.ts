import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export class JsonFileStore<T> {
  private updateChain = Promise.resolve();

  public constructor(
    private readonly filePath: string,
    private readonly createDefaultValue: () => T
  ) {}

  public async read(): Promise<T> {
    await mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as T;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        const initialValue = this.createDefaultValue();
        await this.writeDirect(initialValue);
        return initialValue;
      }

      throw error;
    }
  }

  public async write(value: T): Promise<void> {
    await this.enqueue(async () => {
      await this.writeDirect(value);
    });
  }

  public async update(updater: (current: T) => T | Promise<T>): Promise<T> {
    let nextValue!: T;

    await this.enqueue(async () => {
      const current = await this.read();
      nextValue = await updater(current);
      await this.writeDirect(nextValue);
    });

    return nextValue;
  }

  private async enqueue(work: () => Promise<void>): Promise<void> {
    this.updateChain = this.updateChain.then(work, work);
    await this.updateChain;
  }

  private async writeDirect(value: T): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });

    const tempFile = `${this.filePath}.tmp`;
    await writeFile(tempFile, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(tempFile, this.filePath);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
