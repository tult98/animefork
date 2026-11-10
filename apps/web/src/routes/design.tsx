import { createFileRoute, notFound } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Button } from '../components/ui/button.tsx';
import {
  Header,
  HeaderActions,
  HeaderIconButton,
  HeaderNav,
  NavPill,
} from '../components/ui/header.tsx';
import { Bell, Info, Play, Search } from '../components/ui/icons.ts';
import { Input } from '../components/ui/input.tsx';

export const Route = createFileRoute('/design')({
  // Dev-only gallery. The route stays out of NAV_ITEMS and 404s in a production build.
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: Gallery,
});

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section data-testid={`design:${id}`} className="py-8">
      <h2 className="mb-4 text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Buttons() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <Button kind="pill" tone="play" icon={Play} iconFilled>
          Play
        </Button>
        <Button kind="pill" tone="quiet" icon={Info}>
          More info
        </Button>
        <Button kind="pill" tone="brand">
          Subscribe
        </Button>
        <Button kind="pill" tone="outline">
          Manage profiles
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button kind="pill" tone="play">
          Play
        </Button>
        <Button kind="pill" tone="quiet">
          More info
        </Button>
        <Button kind="pill" tone="brand" icon={Info}>
          Subscribe
        </Button>
        <Button kind="pill" tone="outline" icon={Play} iconFilled>
          Manage profiles
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button kind="rect" tone="primary">
          Get started
        </Button>
        <Button kind="rect" tone="utility-primary">
          Sign in
        </Button>
        <Button kind="rect" tone="utility-outline">
          Help
        </Button>
      </div>
    </div>
  );
}

function Inputs() {
  return (
    <div className="flex flex-wrap items-start gap-4">
      <Input label="Email address" />
      <Input label="Email address" defaultValue="mika@example.com" />
      <Input
        label="Email address"
        defaultValue="mika@"
        error="Error: enter a full email address."
      />
    </div>
  );
}

function HeaderDemo({ solid }: { solid?: boolean }) {
  return (
    <Header solid={solid} className="px-6">
      <HeaderNav aria-label="Primary">
        <NavPill href="#" current>
          Home
        </NavPill>
        <NavPill href="#">Series</NavPill>
        <NavPill href="#">Movies</NavPill>
        <NavPill href="#">New &amp; popular</NavPill>
        <NavPill href="#">My list</NavPill>
      </HeaderNav>
      <HeaderActions>
        <HeaderIconButton icon={Search} label="Search" />
        <HeaderIconButton icon={Bell} label="Notifications" />
        <span className="af-avatar" role="img" aria-label="Profile" />
      </HeaderActions>
    </Header>
  );
}

function Gallery() {
  return (
    <div>
      <h1 className="pt-8 text-2xl font-semibold">Design system</h1>
      <Section id="buttons" title="Buttons">
        <Buttons />
      </Section>
      <Section id="inputs" title="Inputs">
        <Inputs />
      </Section>
      <Section id="header" title="Header">
        <div className="flex flex-col gap-4">
          <HeaderDemo />
          <HeaderDemo solid />
        </div>
      </Section>
      <Section id="paper" title="Paper theme">
        <div data-theme="paper" className="bg-canvas p-6 text-ink">
          <div className="flex flex-col gap-6">
            <Buttons />
            <Inputs />
          </div>
        </div>
      </Section>
    </div>
  );
}
