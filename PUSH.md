# Push this to GitHub

The target repo **https://github.com/begiflow/appicon.old** exists and is empty.
This sandbox's git proxy refuses to inject a credential for it, because the repo
is not in the session's authorized source set — so the push has to happen from
your machine (or from a session that has the repo connected).

`origin` is already configured. Everything is committed on `main`.

```bash
unzip appicon-clone.zip && cd appicon-clone
git remote -v          # origin -> https://github.com/begiflow/appicon.old.git
git push -u origin main
```

## Then enable Pages

**Settings → Pages → Build and deployment → Source: `GitHub Actions`**

`.github/workflows/deploy.yml` runs on every push to `main`, builds with
`BASE_PATH=/<repo-name>/` (read from the repo automatically), and publishes to:

**https://begiflow.github.io/appicon.old/**

## Verify locally first

```bash
npm install
npm run dev     # http://localhost:5173
npm run test    # builds, then runs 55 headless assertions against real Chromium
```

If Playwright cannot find a browser:

```bash
npx playwright install chromium
# or point at an existing one:
PW_CHROMIUM_PATH=/path/to/chrome npm run test
```
