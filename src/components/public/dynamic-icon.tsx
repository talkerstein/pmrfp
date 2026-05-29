import * as Lucide from "lucide-react";
import type { LucideProps } from "lucide-react";

type IconMap = Record<string, React.ComponentType<LucideProps>>;

/** Render a Lucide icon by its string name (used by category grids). */
export function DynamicIcon({
  name,
  ...props
}: Omit<LucideProps, "name"> & { name: string | null }) {
  const map = Lucide as unknown as IconMap;
  const Cmp = (name && map[name]) || Lucide.Wrench;
  return <Cmp {...props} />;
}
