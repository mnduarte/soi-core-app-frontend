interface BrandLogoProps {
  size?: number;
}

export function BrandLogo({ size = 30 }: BrandLogoProps) {
  return (
    <div className="sidebar__logo" style={{ width: size, height: size, borderRadius: size * 0.27 }}>
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 3c-3 0-5 1.5-5 4 0 1.3.3 2 .8 3.2.5 1.3.5 2.5.5 4.3 0 2.6 1.3 7 2 7s1.2-1.2 1.7-3 .5-2.5 1-2.5.5.6 1 2.5 1 3 1.7 3 2-4.4 2-7c0-1.8 0-3 .5-4.3.5-1.2.8-1.9.8-3.2 0-2.5-2-4-5-4z"
          fill="white"
        />
      </svg>
    </div>
  );
}
