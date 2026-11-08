import { Copy, Maximize2, Minimize2, Minus, Square, X } from "lucide-react";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import type { WindowCommand } from "../../shared/ipc";
import { usePlatform } from "../usePlatform";
import styles from "./WindowControls.module.scss";

interface Control {
  readonly command: WindowCommand;
  readonly label: string;
  readonly icon: ReactElement;
}

/**
 * Follow whether the window is maximized.
 * @returns {boolean} Whether the window currently fills the screen.
 */
function useMaximized(): boolean {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const { windowControls } = window.commaDesktop;
    let current = true;
    void windowControls.isMaximized().then((value) => {
      if (current) {
        setMaximized(value);
      }
    });
    const unsubscribe = windowControls.onMaximizedChange(setMaximized);
    return () => {
      current = false;
      unsubscribe();
    };
  }, []);
  return maximized;
}

/**
 * Minimize, maximize/restore and close buttons, drawn for the platform's conventions.
 * @returns {React.ReactElement} The window controls.
 */
export function WindowControls() {
  const platform = usePlatform();
  const maximized = useMaximized();
  const mac = platform === "darwin";
  const toggle = maximized ? "Restore" : "Maximize";
  const iconSize = mac ? 7 : 12;
  const controls: readonly Control[] = mac
    ? [
        { command: "close", label: "Close", icon: <X size={iconSize} /> },
        {
          command: "minimize",
          label: "Minimize",
          icon: <Minus size={iconSize} />,
        },
        {
          command: "toggleMaximize",
          label: toggle,
          icon: maximized ? (
            <Minimize2 size={iconSize} />
          ) : (
            <Maximize2 size={iconSize} />
          ),
        },
      ]
    : [
        {
          command: "minimize",
          label: "Minimize",
          icon: <Minus size={iconSize} />,
        },
        {
          command: "toggleMaximize",
          label: toggle,
          icon: maximized ? (
            <Copy size={iconSize} />
          ) : (
            <Square size={iconSize} />
          ),
        },
        { command: "close", label: "Close", icon: <X size={iconSize} /> },
      ];
  return (
    <div className={styles.controls} data-platform={platform}>
      {controls.map(({ command, label, icon }) => (
        <button
          key={command}
          type="button"
          className={styles.control}
          data-command={command}
          aria-label={label}
          title={label}
          onClick={() => window.commaDesktop.windowControls.run(command)}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
