import 'reflect-metadata';
import fetchMock from '@fetch-mock/vitest';
import { Logger } from '@nestjs/common';
import { afterEach, beforeEach } from 'vitest';
import { TEST_DATABASE_URL } from './test-database.ts';

Logger.overrideLogger(false);

// The store tests that still read DATABASE_URL must not touch the database the dev server uses.
process.env.DATABASE_URL = TEST_DATABASE_URL;

// No test reaches a real server. A request without a route throws, so a test lists every call it expects.
beforeEach(() => {
  fetchMock.mockGlobal();
});
afterEach(() => {
  fetchMock.mockRestore();
});
