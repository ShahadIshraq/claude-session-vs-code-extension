import * as os from "os";
import * as path from "path";
import { runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, "../../");
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");

    // Always use a short user-data-dir so VS Code's IPC socket path stays
    // under the ~103-char Unix limit. The default path
    // (.vscode-test/user-data under the extension root) is too long when the
    // repo lives in a deeply nested directory (e.g. a git worktree), causing
    // VS Code to fail to start. VSCODE_TEST_USER_DATA_DIR overrides the default.
    const userDataDir = process.env.VSCODE_TEST_USER_DATA_DIR ?? path.join(os.tmpdir(), "vsct-claude-sessions");

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: ["--disable-extensions", "--user-data-dir", userDataDir],
      extensionTestsEnv: {
        ...process.env,
        ...(process.env.NODE_V8_COVERAGE ? { NODE_V8_COVERAGE: process.env.NODE_V8_COVERAGE } : {})
      }
    });
  } catch (err) {
    console.error("Failed to run tests", err);
    process.exit(1);
  }
}

void main();
