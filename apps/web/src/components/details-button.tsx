import { ChevronDown } from './ui/icons.ts';

interface DetailsButtonProps {
  name: string;
  testId: string;
  // An upcoming title has no episodes yet, so the modal only has info.
  upcoming?: boolean;
  onOpen: () => void;
}

export function DetailsButton({
  name,
  testId,
  upcoming = false,
  onOpen,
}: DetailsButtonProps) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={`Xem chi tiết ${name}`}
        data-testid={testId}
        className="af-circle"
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
      >
        <ChevronDown aria-hidden="true" />
      </button>
      <span
        aria-hidden="true"
        data-testid={`${testId}:tooltip`}
        className="pointer-events-none absolute right-0 bottom-full z-3 mb-2.5 rounded-sm bg-(--white) px-5 py-2 text-base/[1.2] font-bold whitespace-nowrap text-(--on-light) opacity-0 shadow-[0_6px_24px_rgb(0_0_0/0.55),0_0_0_1px_rgb(0_0_0/0.15)] transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 after:absolute after:top-full after:right-4 after:-mt-1.5 after:size-3 after:rotate-45 after:bg-(--white) after:shadow-[3px_3px_6px_rgb(0_0_0/0.3)] after:content-['']"
      >
        {upcoming ? 'Thông tin' : 'Tập & thông tin'}
      </span>
    </span>
  );
}
