import { Link } from '@tanstack/react-router';
import { Logo } from './ui/logo.tsx';

const LINKS = ['Giới thiệu', 'Điều khoản', 'Quyền riêng tư', 'Liên hệ'];

export function Footer() {
  return (
    <footer
      data-testid="footer"
      className="mt-section flex flex-wrap gap-x-14 gap-y-6 border-t border-border-strong px-(--pad) pt-8 pb-10 text-sm/[1.4] text-muted"
    >
      <Link
        to="/"
        aria-label="AnimeFork, trang chủ"
        className="flex min-h-11 items-center"
      >
        <Logo className="h-7 w-auto" />
      </Link>
      <nav aria-label="Liên kết chân trang" className="flex flex-wrap gap-x-6">
        {LINKS.map((label) => (
          <Link
            key={label}
            to="/"
            className="flex min-h-11 items-center hover:text-ink"
          >
            {label}
          </Link>
        ))}
      </nav>
      <small className="basis-full text-legal">
        Tên phim giữ nguyên cách đọc romaji. Phụ đề tiếng Việt.
      </small>
    </footer>
  );
}
