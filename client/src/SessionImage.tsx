import { useEffect, useState } from "react";
import { sessionKey } from "./socket";

export default function SessionImage({
  imageId,
  roomId,
  className,
  alt = "",
}: {
  imageId: string | null | undefined;
  roomId: string;
  className?: string;
  alt?: string;
}) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    if (!imageId) {
      setSrc("");
      return;
    }
    let cancelled = false;
    let objectUrl = "";
    const token = localStorage.getItem(sessionKey(roomId)) ?? "";

    async function load() {
      try {
        const res = await fetch(`/api/images/${imageId}`, {
          headers: { "x-session-token": token },
        });
        if (!res.ok) throw new Error("imagem indisponível");
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch {
        if (!cancelled) setSrc("");
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageId, roomId]);

  if (!imageId || !src) return null;
  return <img className={className} src={src} alt={alt} />;
}
