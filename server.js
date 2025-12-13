/**
 * Main Entry Point
 * Starts the web interface by default.
 */

import { createWebServer } from './interfaces/web/server.js';

const server = createWebServer();
server.start();
