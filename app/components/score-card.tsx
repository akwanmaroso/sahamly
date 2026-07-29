/**
 * Small stat card — Server Component.
 * Shows a label + value with optional color theming.
 */

type Props = {
  label: string;
  value: string | number;
  color?: "gain" | "loss" | "amber" | "muted" | "ink";
  size?: "sm" | "md" | "lg";
  mono?: boolean;
};

const colorMap = {
  gain: "text-gain",
  loss: "text-loss",
  amber: "text-amber",
  muted: "text-muted",
  ink: "text-ink",
};

export function ScoreCard({ label, value, color = "ink", size = "md", mono = true }: Props) {
  const sizeClass = size === "lg" ? "text-2xl" : size === "md" ? "text-lg" : "text-sm";
  const fontClass = mono ? "font-mono" : "";

  return (
    <div>
      <dt className="font-mono text-[0.6875rem] tracking-wide text-muted uppercase">{label}</dt>
      <dd className={`mt-0.5 font-semibold ${sizeClass} ${fontClass} ${colorMap[color]}`}>
        {value}
      </dd>
    </div>
  );
}
