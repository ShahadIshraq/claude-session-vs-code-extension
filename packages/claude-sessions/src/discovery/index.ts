export { ClaudeSessionDiscoveryService } from "./service";
export type { SessionPrompt, DiscoveryResult, ISessionDiscoveryService } from "@sessions/core";
export { extractText, isDisplayableUserPrompt } from "./content";
export { buildTitle, chooseSessionTitleRaw } from "./title";
export { isPathWithin, isNormalizedPathWithin } from "@sessions/core";
export { collectTranscriptFiles, exists } from "./scan";
export {
  parseTranscriptFile,
  matchWorkspace,
  matchWorkspacePrecomputed,
  precomputeWorkspacePaths
} from "./parseSession";
export type { NormalizedWorkspaceFolder } from "./parseSession";
export { parseAllUserPrompts } from "./parsePrompts";
