# MVPKit Template Validator

Validate the Handlebars variables used by MVPKit template repositories. The CLI scans `*.template` files, checks variables against the contract supported by the MVPKit generator, and catches known placeholders that accidentally land in files copied as plain source.

## Usage

```sh
npx @mvp-kit/template-validator@latest core --dir .
npx @mvp-kit/template-validator@latest saas --dir .
```

## CLI

```sh
mvpkit-validate [template-type] [options]
```

Use `core` or `saas` as the template type. Pass `--dir` to validate a directory other than the current one.

## Development

```sh
bun install --frozen-lockfile
bun run typecheck
bun run build
bun run test
npm pack --dry-run
```
