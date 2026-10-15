import type { ReactNode } from "react";

/** Tiny schematic diagrams for layout structures and image placements. */
function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? "size-5"} aria-hidden fill="none">
      <rect x="1.5" y="1.5" width="21" height="21" rx="3" className="stroke-current" strokeOpacity="0.45" strokeWidth="1.2" />
      {children}
    </svg>
  );
}
const T = (p: { x: number; y: number; w: number; h?: number }) => (
  <rect x={p.x} y={p.y} width={p.w} height={p.h ?? 1.8} rx="0.9" className="fill-current" />
);
const Img = (p: { x: number; y: number; w: number; h: number; rx?: number }) => (
  <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={p.rx ?? 1.2} className="fill-current" fillOpacity="0.28" />
);

export function LayoutIcon({ value, className }: { value: string; className?: string }) {
  switch (value) {
    case "centered stack":
      return (
        <Frame className={className}>
          <T x={7} y={5} w={10} />
          <Img x={8} y={8.5} w={8} h={7} rx={3.5} />
          <T x={6} y={17.5} w={12} />
        </Frame>
      );
    case "centered text block":
      return (
        <Frame className={className}>
          <T x={6} y={8} w={12} />
          <T x={5} y={11.2} w={14} />
          <T x={7} y={14.4} w={10} />
        </Frame>
      );
    case "split":
      return (
        <Frame className={className}>
          <Img x={12.5} y={3} w={8.5} h={18} />
          <T x={4} y={8} w={7} />
          <T x={4} y={11} w={6} />
          <T x={4} y={14} w={5} />
        </Frame>
      );
    case "text top image bottom":
      return (
        <Frame className={className}>
          <T x={6} y={5} w={12} />
          <T x={8} y={8} w={8} />
          <Img x={3} y={11.5} w={18} h={9.5} />
        </Frame>
      );
    case "image top text bottom":
      return (
        <Frame className={className}>
          <Img x={3} y={3} w={18} h={10} />
          <T x={5} y={15.5} w={12} />
          <T x={5} y={18.5} w={8} />
        </Frame>
      );
    case "full-bleed photo":
      return (
        <Frame className={className}>
          <Img x={1.5} y={1.5} w={21} h={21} rx={3} />
          <T x={4} y={14} w={11} />
          <T x={4} y={17} w={7} />
        </Frame>
      );
    case "frame/border":
      return (
        <Frame className={className}>
          <rect x="4" y="4" width="16" height="16" rx="1.5" className="stroke-current" strokeWidth="1.2" />
          <T x={7} y={10} w={10} />
          <T x={8} y={13} w={8} />
        </Frame>
      );
    case "grid":
      return (
        <Frame className={className}>
          <Img x={4} y={4} w={7} h={7} />
          <Img x={13} y={4} w={7} h={7} />
          <Img x={4} y={13} w={7} h={7} />
          <Img x={13} y={13} w={7} h={7} />
        </Frame>
      );
    case "collage":
      return (
        <Frame className={className}>
          <Img x={3.5} y={4} w={9} h={8} />
          <Img x={11} y={9} w={9.5} h={10} />
          <T x={4} y={16} w={5} />
        </Frame>
      );
    default:
      return (
        <Frame className={className}>
          <T x={6} y={9} w={12} />
          <T x={8} y={13} w={8} />
        </Frame>
      );
  }
}

export function ImageIcon({ value, className }: { value: string; className?: string }) {
  switch (value) {
    case "photo":
      return (
        <Frame className={className}>
          <path d="M4 18l5-6 4 4 3-3 4 5z" className="fill-current" fillOpacity="0.5" />
          <circle cx="16" cy="7.5" r="2" className="fill-current" fillOpacity="0.5" />
        </Frame>
      );
    case "illustration":
      return (
        <Frame className={className}>
          <path d="M6 17c2-6 5-9 12-11-1 6-4 10-10 12" className="stroke-current" strokeWidth="1.4" strokeLinecap="round" />
        </Frame>
      );
    case "none":
      return (
        <Frame className={className}>
          <text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="700" className="fill-current">Aa</text>
        </Frame>
      );
    case "frame":
      return (
        <Frame className={className}>
          <rect x="6" y="5" width="12" height="14" rx="6" className="fill-current" fillOpacity="0.3" />
        </Frame>
      );
    case "background":
      return (
        <Frame className={className}>
          <Img x={1.5} y={1.5} w={21} h={21} rx={3} />
          <T x={6} y={11} w={12} h={2.2} />
        </Frame>
      );
    case "cutout":
      return (
        <Frame className={className}>
          <path d="M8 20v-5a4 4 0 018 0v5zM12 10a3 3 0 100-6 3 3 0 000 6z" className="fill-current" fillOpacity="0.45" />
        </Frame>
      );
    case "full-bleed":
      return (
        <Frame className={className}>
          <Img x={1.5} y={1.5} w={21} h={21} rx={3} />
        </Frame>
      );
    case "collage":
      return <LayoutIcon value="collage" className={className} />;
    default:
      return <LayoutIcon value="" className={className} />;
  }
}
