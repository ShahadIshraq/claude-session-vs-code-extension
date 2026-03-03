# Release a new version

Steps to release a new version of the extension:

1. **Ensure you're on `master`** with a clean working tree:
   - `git checkout master && git pull`
   - Verify `git status` is clean

2. **Bump the version** in `package.json`:
   - Accept a version argument (e.g., `/release 0.3.0`) or prompt the user to choose between patch, minor, or major
   - Edit the `"version"` field in `package.json`

3. **Compile and test**:
   - Run `npm run compile` — must have 0 errors
   - Run `npm test` — all tests must pass

4. **Commit the version bump**:
   - `git add package.json`
   - `git commit -m "Bump version to X.Y.Z"`

5. **Create and push the git tag**:
   - `git tag vX.Y.Z`
   - `git push origin master`
   - `git push origin vX.Y.Z`

6. **Verify the release**:
   - The `v*` tag push triggers `.github/workflows/release.yml` which:
     - Packages the `.vsix`
     - Publishes to VS Code Marketplace via `vsce publish`
     - Publishes to Open VSX via `ovsx publish`
     - Creates a GitHub Release with the `.vsix` attached
   - Run `gh run list --workflow=release.yml --limit=1` to check the workflow status
   - Report the workflow URL to the user

Do NOT push the tag unless the user explicitly confirms after seeing the compile and test results.
