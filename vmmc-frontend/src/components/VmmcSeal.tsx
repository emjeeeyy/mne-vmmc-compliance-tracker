export default function VmmcSeal({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/vmmc_logo.png"
      alt="VMMC Seal"
      className={className}
      style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }}
    />
  )
}
