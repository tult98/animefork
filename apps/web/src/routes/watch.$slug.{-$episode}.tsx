import { createFileRoute } from '@tanstack/react-router';
import { WatchScreen } from '../components/player/watch-screen.tsx';

export const Route = createFileRoute('/watch/$slug/{-$episode}')({
  component: Watch,
});

function Watch() {
  const { slug, episode } = Route.useParams();
  return <WatchScreen slug={slug} episodeId={episode} />;
}
