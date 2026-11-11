import {
  Outlet,
  createRootRoute,
  useRouterState,
} from '@tanstack/react-router';
import { DetailsProvider } from '../components/details/details-context.tsx';
import { Footer } from '../components/footer.tsx';
import { TabBar } from '../components/tab-bar.tsx';
import { TopBar } from '../components/top-bar.tsx';

export const Route = createRootRoute({ component: RootLayout });

function RootLayout() {
  const fullScreen = useRouterState({
    select: (state) => state.location.pathname.startsWith('/watch/'),
  });
  return (
    <DetailsProvider>
      {fullScreen ? (
        <Outlet />
      ) : (
        <div className="flex min-h-screen flex-col">
          <TopBar />
          <main className="flex-1">
            <Outlet />
          </main>
          <Footer />
          <TabBar />
        </div>
      )}
    </DetailsProvider>
  );
}
