# Push this to GitHub

The repo `begiflow/appicon-clone` does not exist yet and this session's token is
scoped to an existing repository set, so it could not be created from here.
Everything is committed locally — you just need a remote.

## Option A — GitHub CLI (one command)

```bash
unzip appicon-clone.zip && cd appicon-clone
gh repo create begiflow/appicon-clone --public --source=. --remote=origin --push
```

## Option B — web UI

1. Create an **empty** public repo at https://github.com/new named `appicon-clone`
   (no README, no .gitignore, no licence — the history is already here).
2. Then:

```bash
unzip appicon-clone.zip && cd appicon-clone
git remote add origin https://github.com/begiflow/appicon-clone.git
git push -u origin main
```

## Then enable Pages

**Settings → Pages → Build and deployment → Source: `GitHub Actions`**

The workflow in `.github/workflows/deploy.yml` runs on every push to `main` and
publishes to https://begiflow.github.io/appicon-clone/

## Verify locally first

```bash
npm install
npm run dev     # http://localhost:5173
npm run test    # builds, then runs 55 headless assertions against real Chromium
```
