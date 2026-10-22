import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ESLint } from 'eslint';

const eslint = new ESLint();

const cases = [
  [
    'app composes layout',
    'app/app.component.ts',
    "import './layout/navbar/navbar.component';",
    true,
  ],
  [
    'app lazily loads route APIs',
    'app/app.routes.ts',
    "import('./feature/home/home.routes');",
    true,
  ],
  [
    'app cannot eagerly import route APIs',
    'app/app.routes.ts',
    "import './feature/home/home.routes';",
    false,
  ],
  [
    'app cannot import feature implementation',
    'app/app.component.ts',
    "import './feature/home/home.component';",
    false,
  ],
  [
    'dynamic imports cannot bypass feature entry points',
    'app/app.routes.ts',
    "import('./feature/home/home.component');",
    false,
  ],
  [
    'core can read environment configuration',
    'app/core/providers/provide-core.ts',
    "import '../../../environments/environment';",
    true,
  ],
  [
    'core cannot depend on UI',
    'app/core/providers/provide-core.ts',
    "import '../../ui/date-format/event-date-format.pipe';",
    false,
  ],
  [
    'core cannot depend on layout',
    'app/core/providers/provide-core.ts',
    "import '../../layout/navbar/navbar.component';",
    false,
  ],
  [
    'core cannot depend on features',
    'app/core/providers/provide-core.ts',
    "import '../../feature/home/home.component';",
    false,
  ],
  [
    'UI cannot depend on application services',
    'app/ui/date-format/event-date-format.pipe.ts',
    "import '../../core/toast/toast.service';",
    false,
  ],
  [
    'layout can consume application services',
    'app/layout/toast-outlet/toast-outlet.component.ts',
    "import '../../core/toast/toast.service';",
    true,
  ],
  [
    'layout cannot depend on features',
    'app/layout/navbar/navbar.component.ts',
    "import '../../feature/home/home.component';",
    false,
  ],
  [
    'features can use their own implementation',
    'app/feature/home/home.component.ts',
    "import './components/hero/hero.component';",
    true,
  ],
  [
    'features can use shared patterns',
    'app/feature/home/home.component.ts',
    "import '../../pattern/past-events/past-events.component';",
    true,
  ],
  [
    'features cannot import sibling implementation',
    'app/feature/past-events/past-events-page.component.ts',
    "import '../home/components/hero/hero.component';",
    false,
  ],
  [
    'feature re-exports cannot bypass isolation',
    'app/feature/past-events/past-events-page.component.ts',
    "export * from '../home/home.component';",
    false,
  ],
  [
    'type imports cannot bypass feature isolation',
    'app/feature/past-events/past-events-page.component.ts',
    "export type { HomeComponent } from '../home/home.component';",
    false,
  ],
  [
    'features can compose lazy route APIs',
    'app/feature/submit-talk/submit-talk.routes.ts',
    "import('../submit-talk-success/submit-talk-success.routes');",
    true,
  ],
  [
    'feature route APIs must remain lazy across features',
    'app/feature/submit-talk/submit-talk.routes.ts',
    "import '../submit-talk-success/submit-talk-success.routes';",
    false,
  ],
  [
    'feature implementation cannot reach sibling route APIs',
    'app/feature/home/home.component.ts',
    "import('../chat/chat.routes');",
    false,
  ],
  [
    'patterns can use shared domain models',
    'app/pattern/past-events/past-events.component.ts',
    "import '../../core/models/event.interface';",
    true,
  ],
  [
    'patterns cannot depend on features',
    'app/pattern/past-events/past-events.component.ts',
    "import '../../feature/home/home.component';",
    false,
  ],
  [
    'browser features cannot import server code',
    'app/feature/chat/chat.routes.ts',
    "import('../../../server/chat/policy');",
    false,
  ],
  [
    'unknown local dependencies fail closed',
    'app/feature/home/home.component.ts',
    "import './unclassified-missing-file';",
    false,
  ],
  [
    'unclassified application folders fail closed',
    'app/misc/example.ts',
    'export const value = 1;',
    false,
  ],
];

for (const [name, path, code, allowed] of cases) {
  test(name, async () => {
    const [result] = await eslint.lintText(code, { filePath: `src/${path}` });
    const violations = result.messages.filter((message) =>
      message.ruleId?.startsWith('boundaries/'),
    );
    assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
    assert.equal(violations.length === 0, allowed, JSON.stringify(result.messages));
  });
}
