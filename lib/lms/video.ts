export type VideoEmbed = { kind: "iframe" | "file"; src: string };

/**
 * Ubah URL video apa pun menjadi sumber yang bisa diputar INLINE di LMS.
 * - File video langsung (.mp4/.webm/…) → player HTML5 native (sepenuhnya in-app).
 * - YouTube / Vimeo / Google Drive → iframe embed (main di halaman, tanpa pindah app).
 * - Lainnya → iframe dengan URL apa adanya.
 */
export function resolveVideo(url: string): VideoEmbed {
  const u = (url ?? "").trim();
  if (!u) return { kind: "iframe", src: "" };

  // File video langsung
  if (/\.(mp4|webm|ogg|ogv|mov|m4v)(\?.*)?$/i.test(u)) {
    return { kind: "file", src: u };
  }

  // YouTube: watch, youtu.be, embed, shorts, live, dengan/atau tanpa param ekstra
  const yt = u.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/
  );
  if (yt) {
    return { kind: "iframe", src: `https://www.youtube.com/embed/${yt[1]}?rel=0&modestbranding=1` };
  }

  // Vimeo
  const vm = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) {
    return { kind: "iframe", src: `https://player.vimeo.com/video/${vm[1]}` };
  }

  // Google Drive (file share link) → preview player
  const gd = u.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (gd) {
    return { kind: "iframe", src: `https://drive.google.com/file/d/${gd[1]}/preview` };
  }

  return { kind: "iframe", src: u };
}
