// The compose file in this directory serves this database. CI starts the same image as a service.
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://api:local-api@localhost:54330/api_test';
