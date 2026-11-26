#!/usr/bin/env node
import { runCli } from '../dist/cli.js';

const exitCode = runCli(process.argv.slice(2));
process.exitCode = exitCode;
