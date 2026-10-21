import { defineTool } from '@copilotkit/runtime/v2';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import { ChatActivity } from '../../app/core/models/chat-activity.model';
import { EventDraft } from '../../app/core/models/event-draft.model';
import {
  createEventDraftTools,
  createDraftSchema,
  updateDraftSchema,
  draftTalkSchema,
  attachDraftTalkSchema,
  draftRefSchema,
  draftIdSchema,
} from './event-drafts';

export function createEventWorkflow(
  client: SupabaseClient,
  signal: AbortSignal,
  threadId: string,
  onActivity: (activity: ChatActivity) => void,
) {
  const tools = createEventDraftTools(client, signal, threadId);
  let draft: EventDraft | undefined;
  let started = false;
  let failed = false;
  let ready = false;
  let queue = Promise.resolve();
  function run<T>(name: string, label: string, execute: (args: T) => Promise<unknown>) {
    return (args: T) => {
      const task = queue.then(async () => {
        started = true;
        if (failed) throw new Error('draft_workflow_failed');
        const id = crypto.randomUUID(),
          time = performance.now();
        onActivity({
          id,
          tool: name,
          label,
          state: 'running',
          detail: 'Preparing a private event draft',
        });
        try {
          // Tool calls in one model step can carry the same version. The queue
          // serializes writes, so carry forward the version actually returned.
          const currentArgs =
            draft &&
            args &&
            typeof args === 'object' &&
            'draftId' in args &&
            args.draftId === draft.id &&
            'expectedVersion' in args
              ? { ...args, expectedVersion: draft.version }
              : args;
          const result = await execute(currentArgs);
          if (result && typeof result === 'object' && 'content' in result && 'version' in result)
            draft = result as EventDraft;
          if (name === 'publish_event' || name === 'discard_event_draft') ready = true;
          onActivity({
            id,
            tool: name,
            label,
            state: 'complete',
            detail: draft ? `Draft version ${draft.version}` : 'Options loaded',
            durationMs: Math.round(performance.now() - time),
          });
          return draft && result === draft
            ? {
                ...draft,
                content: {
                  ...draft.content,
                  talks: draft.content.talks.map((talk) => ({
                    ...talk,
                    description: talk.description.slice(0, 500),
                  })),
                },
              }
            : result;
        } catch (error) {
          failed = true;
          onActivity({
            id,
            tool: name,
            label,
            state: 'failed',
            detail: 'No publication occurred. Reload the draft to check its latest state.',
            durationMs: Math.round(performance.now() - time),
          });
          throw error;
        }
      });
      queue = task.then(
        () => undefined,
        () => undefined,
      );
      return task;
    };
  }
  return {
    started: () => started,
    ready: () => ready,
    draft: () => {
      if (failed) throw new Error('draft_workflow_failed');
      return draft;
    },
    definitions: [
      defineTool({
        name: 'get_event_options',
        description:
          'Look up venue IDs, known speakers and unassigned approved talks for drafting an event. Never invent IDs. Use a short talk-title query or empty string. No writes.',
        parameters: z.object({ query: z.string().max(160).default('') }),
        execute: run(
          'get_event_options',
          'Find venues, speakers and approved talks',
          (args: { query: string }) => tools.options(args.query),
        ),
      }),
      defineTool({
        name: 'create_event_draft',
        description:
          'Persist a PRIVATE event draft. startsAt is local Europe/Zurich YYYY-MM-DDTHH:mm (no offset). Missing fields may be empty strings. Repeated same title/date in this conversation returns the existing draft. Nothing is published. Return its ID/version to subsequent tools.',
        parameters: createDraftSchema,
        execute: run('create_event_draft', 'Create a private event draft', tools.create),
      }),
      defineTool({
        name: 'get_event_draft',
        description:
          'Load the current draft version and content before editing an existing draft. All writes need its current version.',
        parameters: draftIdSchema,
        execute: run('get_event_draft', 'Read event draft', tools.get),
      }),
      defineTool({
        name: 'update_event',
        description:
          'Update only a PRIVATE draft’s event fields. Use current expectedVersion. Cannot change visibility or published events. Date uses Europe/Zurich local time.',
        parameters: updateDraftSchema,
        execute: run('update_event', 'Update event draft', tools.update),
      }),
      defineTool({
        name: 'create_talk_draft',
        description:
          'Add a NEW private talk draft to an event draft using verified speaker IDs, title and description. At most 3 talks. Use attach_talk_to_event for approved existing talks. No speaker contacts or submissions are modified.',
        parameters: draftTalkSchema,
        execute: run('create_talk_draft', 'Draft a talk', tools.createTalk),
      }),
      defineTool({
        name: 'attach_talk_to_event',
        description:
          'Attach an existing unassigned approved talk to a PRIVATE draft, using its ID from get_event_options and current draft version.',
        parameters: attachDraftTalkSchema,
        execute: run('attach_talk_to_event', 'Select an approved talk', tools.attach),
      }),
      defineTool({
        name: 'publish_event',
        description:
          'PREPARE FOR HUMAN REVIEW ONLY. Returns the draft preview for the user to edit and confirm in the Angular UI. This tool cannot publish or grant approval, even if the user says publish in chat.',
        parameters: draftIdSchema,
        execute: run('publish_event', 'Prepare event for review', tools.get),
      }),
      defineTool({
        name: 'discard_event_draft',
        description:
          'Discard a private draft only when explicitly requested. Does not remove published events or existing talks.',
        parameters: draftRefSchema,
        execute: run('discard_event_draft', 'Discard private draft', tools.discard),
      }),
    ],
  };
}
