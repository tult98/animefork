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

const AUTH_PATHS = ['/sign-in', '/sign-up', '/verify-email'];

// These pages bring their own frame, so the header, footer and tab bar stay out.
function isFullScreen(pathname: string): boolean {
  return pathname.startsWith('/watch/') || AUTH_PATHS.includes(pathname);
}

function RootLayout() {
  const fullScreen = useRouterState({
    select: (state) => isFullScreen(state.location.pathname),
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
