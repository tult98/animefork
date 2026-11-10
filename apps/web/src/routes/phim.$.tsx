import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../components/placeholder-page.tsx';

export const Route = createFileRoute('/phim/$')({
  component: () => <PlaceholderPage name="Title" />,
});
