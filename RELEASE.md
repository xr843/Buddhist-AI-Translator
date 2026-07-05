# Release Process

Current version: 0.1.0

This project is a static web app with an optional Cloudflare Worker proxy. Use a
release only after the repository is green on `master`.

## Checklist

1. Confirm the intended version in `package.json`.
2. Run the full local verification:

   ```bash
   npm run verify
   ```

3. Confirm the latest `master` CI run passed on GitHub.
4. Create and push an annotated version tag:

   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

5. Create a GitHub release from the tag:

   ```bash
   gh release create v0.1.0 --title "v0.1.0" --notes "Initial public release."
   ```

6. Smoke-test the public GitHub Pages URL and any configured Worker deployment.

## Notes

- Keep release notes focused on user-visible changes, security fixes, and
  deployment requirements.
- Do not publish a release from a branch that has not passed `npm run verify`.
- If the Worker proxy changed, include any required secret or KV migration steps.
