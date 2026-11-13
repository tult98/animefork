import 'reflect-metadata';
import fetchMock from '@fetch-mock/vitest';
import { Logger } from '@nestjs/common';
import { afterEach, beforeEach } from 'vitest';

Logger.overrideLogger(false);

// No test reaches a real server. A request without a route throws, so a test lists every call it expects.
beforeEach(() => {
  fetchMock.mockGlobal();
});
afterEach(() => {
  fetchMock.mockRestore();
});
