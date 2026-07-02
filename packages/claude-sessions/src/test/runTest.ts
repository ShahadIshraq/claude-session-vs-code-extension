import * as path from "path";
import { runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, "../../");
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");

    // Allow redirecting VS Code's user-data-dir to a short path. The default
    // (.vscode-test/user-data under the extension) can exceed the ~103-char Unix
    // socket path limit when the repo lives in a deeply nested directory (e.g. a
    // git worktree), which makes VS Code fail to start. Opt-in; CI is unaffected.
    const userDataDir = process.env.VSCODE_TEST_USER_DATA_DIR;

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: ["--disable-extensions", ...(userDataDir ? ["--user-data-dir", userDataDir] : [])],
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
