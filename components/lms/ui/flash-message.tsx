"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";

export function FlashMessage({ message }: { message?: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(t);
  }, [message]);

  if (!visible || !message) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-green-100 bg-green-50 px-4 py-3">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
        <p className="text-sm font-medium text-green-800">{message}</p>
      </div>
      <button onClick={() => setVisible(false)} className="shrink-0 text-green-500 hover:text-green-700">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
