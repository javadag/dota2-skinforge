# Skinforge release guide

Run the commands from the repo root in PowerShell. Run them one at a time and stop if any command fails. Replace `1.5.1` with the version you want to ship.

## 1. Check the assets and set the version

```powershell
$version = '1.5.1'
npm run sync:assets -- --dry-run
npm version $version --no-git-tag-version
```

The dry run checks that the local asset folders contain the files listed in `data/cosmetic-assets.json`. It reads from `D:\skinforge_assets` by default. Set `SKINFORGE_ASSET_SOURCE` if you keep your assets elsewhere.

## 2. Upload the packages for this release

For the first release using versioned packages, run a full upload. Set the R2 credentials from [`.env.example`](.env.example) in your local `.env` first.

```powershell
npm run sync:assets -- --upload
```

For later releases, pass `--group` once per changed group. The following command publishes just the two Crystal Maiden groups.

```powershell
npm run sync:assets -- --upload --group crystal_maiden
```

If the packages are already published and the assets are unchanged, skip this step. The upload adds versioned archive files and keeps the legacy CDN manifest available for older builds. Keep published archives available while builds that use them are supported.

## 3. Prepare and test the release

```powershell
npm run check:assets -- --prepare
npm test
npm run typecheck
```

`--prepare` checks your local asset files against the package metadata, verifies every published archive, and pins the results to this app version in `data/cosmetic-packages.json`.

## 4. Commit and push the tag

Stage the release code and data changes you intend to ship. Include both cosmetic manifests and both npm version files, then review the staged list.

```powershell
git add -- package.json package-lock.json data/cosmetic-assets.json data/cosmetic-packages.json
git diff --cached --stat
git commit -m "Release v$version"
git push origin main
git tag -a "v$version" -m "Release v$version"
git push origin "v$version"
```

The tag push triggers the [GitHub release workflow](.github/workflows/release.yml). It checks the pinned cosmetic archives and bundled icons before building the Windows release. Check the workflow run in GitHub Actions for the result.
