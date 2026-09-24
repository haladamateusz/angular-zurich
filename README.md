# Angular Zürich

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.1.4.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Unused code analysis

Run [Knip](https://knip.dev/) to find unused files, dependencies, and exports:

```bash
npm run knip
```

Knip discovers Angular entry points from `angular.json`. The configuration also includes
the Vercel server entry and tests, and scopes analysis to application TypeScript and
JavaScript plus Node scripts. CSS imports are followed, but unused CSS files are not
reported because Angular references component styles through metadata. Agent skills and
separately managed Deno functions under `supabase/functions` are outside this scan.

Knip exits with a nonzero status when it finds issues; review its findings before removing code.

### Knip MCP in Codex

The project's `.codex/config.toml` registers the [Knip MCP server](https://knip.dev/reference/integrations)
using the locally installed package. Run `npm ci` first, then restart Codex's MCP servers
to load the configuration in this trusted project. The server provides `knip-run` and
`knip-docs` tools, plus a `knip-configure` prompt.

The underlying stdio server can also be started with `npm run --silent knip:mcp`.
See [Codex MCP configuration](https://developers.openai.com/codex/mcp/) for client setup details.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

The archive chat has browser tests with synthetic authentication and mocked responses:

```bash
npx playwright install chromium
npm run test:chat:browser
```

See [archive chat setup](docs/chatbot-setup.md) for OpenRouter configuration, approved-user access, local development, quotas, MCP tools, and deployment steps.
