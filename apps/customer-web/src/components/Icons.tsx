import type { ReactNode, SVGProps } from "react";

function Svg({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

type IconProps = SVGProps<SVGSVGElement>;

export const IconStore = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9l1.5-5h13L20 9" />
    <path d="M4 9a2.5 2.5 0 005 0 2.5 2.5 0 005 0 2.5 2.5 0 005 0" />
    <path d="M5 12v8h14v-8" />
    <path d="M10 20v-4h4v4" />
  </Svg>
);

export const IconCart = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 4h2.5l2.2 10.5a1 1 0 001 .8h8.6a1 1 0 001-.8L20 8H6.2" />
    <circle cx="9.5" cy="19" r="1.4" />
    <circle cx="16.5" cy="19" r="1.4" />
  </Svg>
);

export const IconReceipt = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
    <path d="M9 8h6M9 12h6" />
  </Svg>
);

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </Svg>
);

export const IconPin = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </Svg>
);

export const IconChevron = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
);

export const IconArrowRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

export const IconGrid = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z" />
  </Svg>
);

export const IconFilter = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="8" cy="17" r="2" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);

export const IconBack = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 6l-6 6 6 6" />
  </Svg>
);

export const IconPackage = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
  </Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconMinus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
);

export const IconAlert = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5M12 16h.01" />
  </Svg>
);

export const IconUser = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20.5a7.5 7.5 0 0115 0" />
  </Svg>
);

export const IconChat = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20.5 11.5a8 8 0 01-11.8 7L4 20l1.5-4.5a8 8 0 1115-4z" />
  </Svg>
);

export const IconSend = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 3L10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5z" />
  </Svg>
);

export const IconLogout = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4h5v16h-5" />
    <path d="M10 8l-4 4 4 4M6 12h9" />
  </Svg>
);

// Category icons
export const IconRice = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 12h17a8.5 8.5 0 01-5.5 8H9a8.5 8.5 0 01-5.5-8z" />
    <path d="M7 12c0-4 2.2-7 5-7s5 3 5 7" />
    <path d="M10 8.5h.01M13.5 8h.01M12 10.5h.01" />
  </Svg>
);

export const IconSpice = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 8h6l1.5 4v8.5h-9V12z" />
    <path d="M9.5 8V4.5h5V8" />
    <path d="M7.5 14h9" />
  </Svg>
);

export const IconCan = (p: IconProps) => (
  <Svg {...p}>
    <ellipse cx="12" cy="6" rx="6.5" ry="2.5" />
    <path d="M5.5 6v12c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5V6" />
    <path d="M5.5 11c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5" />
  </Svg>
);

export const IconNoodle = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 12.5h17a8.5 8.5 0 01-5.5 8H9a8.5 8.5 0 01-5.5-8z" />
    <path d="M8 12.5V9c0-2 3-2 3 0v3.5M11 9V6.5c0-2 3-2 3 0v6" />
    <path d="M17 4l-1.5 8.5" />
  </Svg>
);

export const IconDrink = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 8h11L16 21H8z" />
    <path d="M5 8h14" />
    <path d="M12 8l1.5-5H17" />
  </Svg>
);

export const IconOil = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 3h4v3.5l2.5 4v9a1.5 1.5 0 01-1.5 1.5H9a1.5 1.5 0 01-1.5-1.5v-9l2.5-4z" />
    <path d="M12 12.5c1.2 1.5 1.8 2.4 1.8 3.2a1.8 1.8 0 01-3.6 0c0-.8.6-1.7 1.8-3.2z" />
  </Svg>
);

export const IconHousehold = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 9h6l2 3.5V21H7v-8.5z" />
    <path d="M10.5 9V5.5h3V9" />
    <path d="M13.5 5.5H18l1 2" />
  </Svg>
);

export const IconLeaf = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 19c0-9 5.5-14 15-14 0 9.5-5 15-13 14" />
    <path d="M5 21c1.5-5 5-8.5 9.5-10.5" />
  </Svg>
);

export const IconSnack = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 3h10l-1 2.5 1 2.5v8l-1 2.5 1 2.5H7l1-2.5-1-2.5V8l1-2.5z" />
    <path d="M10 10l4 4M14 10l-4 4" />
  </Svg>
);

export const IconEgg = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3c3.6 0 6.5 5.4 6.5 10.5a6.5 6.5 0 01-13 0C5.5 8.4 8.4 3 12 3z" />
  </Svg>
);

export const IconFlour = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 6.5h10l1.5 14h-13z" />
    <path d="M7 6.5L8.5 3h7L17 6.5" />
    <path d="M12 11c-1.5 1.5-1.5 3 0 4.5 1.5-1.5 1.5-3 0-4.5z" />
  </Svg>
);
