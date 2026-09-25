interface LogoMarkProps {
  size?: number
}

export default function LogoMark({ size = 32 }: LogoMarkProps) {
  return (
    <img
      src="/logo-mark.png"
      alt="RegWay"
      width={size}
      height={size}
      className="flex-shrink-0"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.25) }}
    />
  )
}
