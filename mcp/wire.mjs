// The wire for Claude Desktop, over stdio.
//
// The server and every tool live in server.mjs, once. api/mcp.mjs serves the
// same server over HTTP for claude.ai and the phone.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { wireServer } from './server.mjs';

await wireServer().connect(new StdioServerTransport());
