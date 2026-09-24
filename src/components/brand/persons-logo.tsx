import { cn } from '@/lib/utils';

/** Persons mark (two-tone teal "P"), traced from the brand PNG into vector
 * paths so it stays crisp at any size and its two halves can be animated
 * independently (see .persons-logo-* in globals.css). */
export function PersonsLogo({ className, animated = false }: { className?: string; animated?: boolean }) {
  return (
    <svg
      viewBox="360 290 770 705"
      className={cn('persons-logo', animated && 'persons-logo-animated', className)}
      aria-hidden
      focusable="false"
    >
      <path
        className="persons-logo-bowl"
        fill="#2effcc"
        d="M507 305H905C1030 307 1112 400 1110 512C1108 560 1095 595 1075 625C1050 668 1030 700 1012 740C1000 765 985 773 958 772C890 769 820 771 752 771L903 512H638C625 512 618 516 612 521L597 510C570 460 530 385 498 332C486 312 492 305 507 305Z"
      />
      <path
        className="persons-logo-stem"
        fill="#00d0a5"
        d="M386 510H598L612 522L875 980H652C638 980 628 973 620 960L380 540C368 518 372 510 386 510Z"
      />
    </svg>
  );
}
