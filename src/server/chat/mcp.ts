import { archiveQuerySchema } from './context';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SupabaseClient } from '@supabase/supabase-js';
import { Request, Response } from 'express';
import {
  createArchiveTools,
  eventSchema,
  searchSchema,
  speakerSchema,
  speakerNameSchema,
  talkSchema,
  rankingSchema,
} from './tools';

// Each stateless MCP request owns its verified user client. No shared sessions,
// arbitrary remote servers, SQL execution, or write tools are exposed.
export async function handleArchiveMcp(req: Request, res: Response, client: SupabaseClient) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  const archive = createArchiveTools(client, controller.signal);
  const server = new McpServer({ name: 'angular-zurich-archive', version: '1.0.0' });
  const content = (value: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
  });
  const annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  server.registerTool(
    'search_talks',
    {
      description: 'Search published talk titles and descriptions, including historical events.',
      inputSchema: searchSchema.shape,
      annotations,
    },
    async (args) => content(await archive.searchTalks(args)),
  );
  server.registerTool(
    'find_speakers',
    {
      description: 'Find speakers with published talks by name.',
      inputSchema: searchSchema.shape,
      annotations,
    },
    async (args) => content(await archive.findSpeakers(args)),
  );
  server.registerTool(
    'list_events',
    {
      description: 'Find published events by title, newest first.',
      inputSchema: searchSchema.shape,
      annotations,
    },
    async (args) => content(await archive.listEvents(args)),
  );
  server.registerTool(
    'get_talks_by_speaker',
    {
      description: 'List published talks by speaker ID.',
      inputSchema: speakerSchema.shape,
      annotations,
    },
    async (args) => content(await archive.talksBySpeaker(args)),
  );
  server.registerTool(
    'get_talks_by_event',
    {
      description: 'List published talks by event ID.',
      inputSchema: eventSchema.shape,
      annotations,
    },
    async (args) => content(await archive.talksByEvent(args)),
  );
  server.registerTool(
    'get_talk',
    { description: 'Get a published talk by ID.', inputSchema: talkSchema.shape, annotations },
    async (args) => content(await archive.getTalk(args)),
  );
  server.registerTool(
    'get_speaker_talks',
    {
      description:
        'Find a speaker by name and list published talks with exact totals and pagination.',
      inputSchema: speakerNameSchema.shape,
      annotations,
    },
    async (args) => content(await archive.speakerTalks(args)),
  );
  server.registerTool(
    'get_speaker_stats',
    {
      description:
        'Count a speaker’s past and upcoming published talks across all years, with source records.',
      inputSchema: speakerNameSchema.shape,
      annotations,
    },
    async (args) => content(await archive.speakerStats(args)),
  );
  server.registerTool(
    'rank_speakers',
    {
      description:
        'Rank speakers by distinct talks across all past published events. Returns exact counts and ties; excludes upcoming events.',
      inputSchema: rankingSchema.shape,
      annotations,
    },
    async (args) => content(await archive.rankSpeakers(args)),
  );
  server.registerTool(
    'query_archive',
    {
      description:
        'Search, count or rank published talks using combined topic, speaker/event ID, inclusive year and past/upcoming filters.',
      inputSchema: archiveQuerySchema.shape,
      annotations,
    },
    async (args) => content(await archive.queryArchive(args)),
  );
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on('close', () => controller.abort());
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body as unknown);
  } finally {
    clearTimeout(timer);
    controller.abort();
    await transport.close();
    await server.close();
  }
}
