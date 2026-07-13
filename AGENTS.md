# Angular Zurich Agent Rules

These instructions apply to work in this repository.

## Skill Priority

- When both `.agents/skills/enterprise-architecture` and `.agents/skills/angular-developer` are relevant, always prioritize `enterprise-architecture` for architecture, project structure, dependency boundaries, and feature organization decisions.
- Use `angular-developer` as the secondary source for Angular framework patterns, APIs, and implementation details when it does not conflict with `enterprise-architecture`.

## Workflow

- All commits must use this Conventional Commits format:

  `<type>(<scope>): <short summary>`

- The `<type>` and `<short summary>` fields are required.
- The `(<scope>)` field is optional.
- The `<type>` must be one of:
  - `build`: Changes that affect the build system or external dependencies.
  - `ci`: Changes to CI configuration files and scripts.
  - `docs`: Documentation-only changes.
  - `feat`: A new feature.
  - `fix`: A bug fix.
  - `perf`: A code change that improves performance.
  - `refactor`: A code change that neither fixes a bug nor adds a feature.
  - `test`: Adding missing tests or correcting existing tests.

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
