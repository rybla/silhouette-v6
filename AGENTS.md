# AGENTS

## Scripts

See the "scripts" section of `package.json` for all available scripts common for development.

## Vite and Vitest

This project uses Vite for bundling and Vitest (with Jest) for testing.

## Mantine UI framework

This project relies mainly on the [Mantine](https://mantine.dev) UI framework which provides a comprehensive collection of react components. Use components from the installed "@mantine/*" packages. Use icons from the "@phosphor-icons/react" package.

## PostCSS pre-processing for CSS

This project uses [PostCSS](https://postcss.org).

## Code Validation

After editing any source code, you must run `pnpm run validate`, which will run a collection of code validation tests. You must iteratively address these diagnostics and re-run `pnpm run validate` until all diagnostics have been addressed.
