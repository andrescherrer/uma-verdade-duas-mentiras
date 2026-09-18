const COLORS = ["#f6a04d", "#38a054", "#5860e8", "#e4458c", "#5ba3e0", "#e0ac30"];

export function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash + name.charCodeAt(i) * (i + 3)) % COLORS.length;
  return COLORS[hash];
}

export function initial(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}
