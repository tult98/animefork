import { ModuleRef, ModulesContainer } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.ts';
import { ENV } from '../src/config/app.config.ts';
import { PG_POOL } from '../src/database/migration-runner.ts';

const SELF_DECLARED_DEPS = 'self:paramtypes';
const DESIGN_PARAMTYPES = 'design:paramtypes';

describe('dependency injection', () => {
  it('names an @Inject token for every constructor parameter of our classes', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ENV)
      .useValue({
        DATABASE_URL: 'postgres://unused@localhost:1/x',
        TMDB_API_KEY: 'key',
      })
      .overrideProvider(PG_POOL)
      .useValue({ end: async () => undefined })
      .compile();
    const classes = new Set<{ name: string; length: number }>();
    for (const module of moduleRef.get(ModulesContainer).values()) {
      classes.add(module.metatype);
      for (const wrapper of [
        ...module.providers.values(),
        ...module.controllers.values(),
      ]) {
        if (
          wrapper.metatype &&
          !wrapper.inject &&
          wrapper.token !== ModuleRef
        ) {
          classes.add(wrapper.metatype);
        }
      }
    }
    const missing: string[] = [];
    for (const cls of classes) {
      if (cls.length === 0 || Reflect.hasMetadata(DESIGN_PARAMTYPES, cls))
        continue;
      const declared: { index: number }[] =
        Reflect.getMetadata(SELF_DECLARED_DEPS, cls) ?? [];
      for (let i = 0; i < cls.length; i++) {
        if (!declared.some((d) => d.index === i))
          missing.push(`${cls.name}#${i}`);
      }
    }
    expect(classes.size).toBeGreaterThan(10);
    expect(missing).toEqual([]);
    await moduleRef.close();
  });
});
