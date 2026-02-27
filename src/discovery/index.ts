export { ClaudeSessionDiscoveryService } from "./service";
export type { SessionPrompt, DiscoveryResult, ISessionDiscoveryService } from "./types";
export { extractText, isDisplayableUserPrompt } from "./content";
export { buildTitle, chooseSessionTitleRaw, parseRenameCommandArgs, parseRenameStdoutTitle } from "./title";
export { isPathWithin } from "./pathUtils";
export { collectTranscriptFiles, exists } from "./scan";
export {
  parseTranscriptFile,
  matchWorkspace,
  matchWorkspacePrecomputed,
  precomputeWorkspacePaths
} from "./parseSession";
export type { NormalizedWorkspaceFolder } from "./parseSession";
export { isNormalizedPathWithin } from "./pathUtils";
export { parseAllUserPrompts } from "./parsePrompts";
