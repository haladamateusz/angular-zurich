# Angular Zürich Agent Rules

These instructions apply to work in this repository.

## Skill Priority

- When both `.agents/skills/enterprise-architecture` and `.agents/skills/angular-developer` are relevant, always prioritize `enterprise-architecture` for architecture, project structure, dependency boundaries, and feature organization decisions.
- Use `angular-developer` as the secondary source for Angular framework patterns, APIs, and implementation details when it does not conflict with `enterprise-architecture`.

## Workflow

### Commit Message Format

All commits must use this Conventional Commits format:

```text
<type>(<scope>): <short summary>
  |       |             |
  |       |             +- Summary in imperative present tense. Not capitalized. No period at the end.
  |       |
  |       +- Commit Scope: angular|app|auth|build|dashboard|events|home|lint|navbar|
  |                         submissions|submit-talk|supabase|talk-submissions|ui
  |
  +- Commit Type: build|ci|docs|feat|fix|perf|refactor|test
```

The `<type>`, `(<scope>)`, and `<short summary>` fields are mandatory. The commit message must always begin with both `<type>` and `(<scope>)`, for example `build(angular): increase component style budget`.

#### Type

Must be one of the following:

| Type | Description |
| --- | --- |
| `build` | Changes that affect the build system, deployment tooling, or external dependencies. |
| `ci` | Changes to CI configuration files and scripts. |
| `docs` | Documentation-only changes. |
| `feat` | A new feature. |
| `fix` | A bug fix. |
| `perf` | A code change that improves performance. |
| `refactor` | A code change that neither fixes a bug nor adds a feature. |
| `test` | Adding missing tests or correcting existing tests. |

#### Scope

The scope should describe the main project area affected, as perceived by someone reading the Git history or changelog. Prefer existing scopes over introducing narrow one-off scopes.

Supported scopes:

- `angular`: Angular framework configuration, migrations, and version-specific framework changes.
- `app`: Application shell, route organization, and cross-feature application wiring.
- `auth`: Authentication flows, login UI, sessions, and organizer sign-in behavior.
- `build`: Production build behavior, deployment configuration, and environment injection.
- `dashboard`: Organizer dashboard views and workflows.
- `events`: Event creation, event details, event visibility, and event data display.
- `home`: Homepage content, sections, stats, and event previews.
- `lint`: ESLint, Stylelint, Prettier, and formatting/linting setup.
- `navbar`: Main navigation, mobile drawer, and user menu behavior.
- `submissions`: Speaker submission data, validation, and speaker-facing submission UI.
- `submit-talk`: Submit-talk route, form, and success flow.
- `supabase`: Supabase schema, client integration, storage, and data access.
- `talk-submissions`: Organizer talk review workflow and talk-submission notifications.
- `ui`: Shared visual polish, layout, theme, and interaction styling.

Use a more specific historical scope only when it is clearly the best fit for the change: `analytics`, `deps`, `email`, `hero`, `sponsors`, `theme`, or `team`.

#### Summary

Use the summary field to provide a succinct description of the change:

- use the imperative, present tense: `add`, not `added` or `adds`
- do not capitalize the first letter
- do not end with a period

#### Commit Message Body

Just as in the summary, use the imperative, present tense.

Use the body when the motivation is not obvious from the summary. Explain why the change is being made and, when useful, compare the previous behavior with the new behavior.

## TypeScript Best Practices

- Use strict type checking.
- Prefer type inference when the type is obvious.
- Avoid the `any` type; use `unknown` when type is uncertain.

## Angular Best Practices

- Always use standalone components over NgModules.
- Do not set `standalone: true` inside Angular decorators. It is the default in Angular v20+.
- Use signals for state management.
- Implement lazy loading for feature routes.
- Do not use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead.
- Use `NgOptimizedImage` for all static images.
- `NgOptimizedImage` does not work for inline base64 images.

## Preline Usage

- Prefer Preline CSS, theme tokens, and utility classes without loading the global Preline JavaScript bundle.
- Do not add `node_modules/preline/dist/index.js` to the global Angular `scripts` array unless a task explicitly requires JS-driven Preline components.
- If a JS-driven Preline component is needed, import only the smallest specific module required instead of bundling all Preline JS globally.

## Accessibility Requirements

- It must pass all AXE checks.
- It must follow WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

## Components

- Keep components small and focused on a single responsibility.
- Use `input()` and `output()` functions instead of decorators.
- Use `computed()` for derived state.
- Prefer inline templates for small components.
- Prefer reactive forms instead of template-driven forms.
- Do not use `ngClass`; use `class` bindings instead.
- Exception: any Tailwind class that contains `:`, `/`, `[`, `]`, `%`, `(`, or `)` must be written using `ngClass` object syntax. This is the only general exception to the `ngClass` rule.
- Do not use `ngStyle`; use `style` bindings instead.
- When using external templates or styles, use paths relative to the component TypeScript file.

## State Management

- Use signals for local component state.
- Use `computed()` for derived state.
- Keep state transformations pure and predictable.
- Do not use `mutate` on signals; use `update` or `set` instead.

## Templates

- Keep templates simple and avoid complex logic.
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`.
- Use the async pipe to handle observables.
- Do not assume globals like `new Date()` are available.
- Do not write arrow functions in templates.

## Services

- Design services around a single responsibility.
- Use the `providedIn: 'root'` option for singleton services.
- Use the `inject()` function instead of constructor injection.
