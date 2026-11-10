import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../components/placeholder-page.tsx';

export const Route = createFileRoute('/browse')({
  component: () => <PlaceholderPage id="browse" />,
});
