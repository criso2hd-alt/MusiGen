import { useState } from "react";
import { X } from "lucide-react";

const BMC_URL = "https://buymeacoffee.com/criso2hdj";
const KEY = "mg.bmcDismissed";

/**
 * "Buy me a coffee" button (style from thor-electro-7), sized to sit inline in
 * the top bar so it never covers the workspace. One click on the × removes it
 * PERMANENTLY (persisted).
 */
export function SupportBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });
  if (dismissed) return null;

  const open = () => {
    const api = (window as any).pywebview?.api;
    if (api?.open_external) api.open_external(BMC_URL);
    else window.open(BMC_URL, "_blank", "noopener");
  };
  const dismiss = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div className="relative flex items-center">
      <button
        onClick={open}
        title="Support MusiGen — buy me a coffee"
        className="block transition hover:-translate-y-0.5"
      >
        <img
          src="/bmc-button.png"
          alt="Buy Me A Coffee"
          className="h-7 rounded-md shadow-[0_2px_8px_rgba(0,0,0,0.45)]"
        />
      </button>
      <button
        onClick={dismiss}
        title="Hide permanently"
        className="absolute -right-1.5 -top-1.5 grid h-[16px] w-[16px] place-items-center rounded-full border border-black/50 bg-[#17181b] text-white shadow-[0_1px_3px_rgba(0,0,0,0.55)] transition hover:bg-[#7e1a18]"
      >
        <X size={10} strokeWidth={3} />
      </button>
    </div>
  );
}
