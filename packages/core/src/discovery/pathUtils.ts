import * as path from "path";

export function isPathWithin(candidatePath: string, rootPath: string): boolean {
  const normalizedCandidate = normalizeFsPath(candidatePath);
  const normalizedRoot = normalizeFsPath(rootPath);

  if (normalizedCandidate === normalizedRoot) {
    return true;
  }

  return normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`);
}

export function normalizeFsPath(fsPath: string): string {
  const resolved = path.resolve(fsPath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function isNormalizedPathWithin(normalizedCandidate: string, normalizedRoot: string): boolean {
  if (normalizedCandidate === normalizedRoot) {
    return true;
  }
  return normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`);
}
