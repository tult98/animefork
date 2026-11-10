import { Outlet, createRootRoute } from '@tanstack/react-router';
import { TopBar } from '../components/top-bar.tsx';

export const Route = createRootRoute({ component: RootLayout });

function RootLayout() {
  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-[1600px] px-4 md:px-8">
        <Outlet />
      </main>
    </>
  );
}
