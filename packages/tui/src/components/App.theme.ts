import { useMemo } from "react";

import { useTheme } from "../theme";

/** Spread-ready style objects for the App component. */
export interface AppTheme {
  /** Root container (column layout, full height). */
  readonly root: {
    readonly flexDirection: "column";
    readonly height: "100%";
  };
  /** Strategy picker screen wrapper. */
  readonly pickerScreen: {
    readonly flexDirection: "column";
  };
  /** Header bar (title + description). */
  readonly header: {
    readonly paddingX: number;
    readonly marginBottom: number;
    /** Title text style. */
    readonly title: {
      readonly bold: boolean;
      readonly color: string;
    };
    /** Description text style. */
    readonly description: {
      readonly dimColor: boolean;
    };
  };
  /** Connection status line on the picker screen. */
  readonly connectionStatus: {
    readonly paddingX: number;
    readonly label: {
      readonly dimColor: boolean;
    };
  };
  /** Horizontal separator line. */
  readonly separator: {
    readonly paddingX: number;
    /** Text props for the separator character. */
    readonly text: {
      readonly dimColor: boolean;
    };
    /** The separator string to render. */
    readonly content: string;
  };
  /** Message list wrapper (grows to fill). */
  readonly messageArea: {
    readonly flexDirection: "column";
    readonly flexGrow: number;
  };
  /** Footer bar (keyboard shortcuts). */
  readonly footer: {
    readonly paddingX: number;
    readonly marginTop?: number;
    readonly text: {
      readonly dimColor: boolean;
    };
  };
}

/**
 * Returns themed style objects for the App component.
 * Consumes global tokens via `useTheme()`.
 */
export function useAppTheme(): AppTheme {
  const tokens = useTheme();

  return useMemo<AppTheme>(
    () => ({
      root: {
        flexDirection: "column",
        height: "100%",
      },
      pickerScreen: {
        flexDirection: "column",
      },
      header: {
        paddingX: tokens.spacing.sm,
        marginBottom: tokens.spacing.none,
        title: {
          bold: tokens.typography.headerBold,
          color: tokens.colors.primary,
        },
        description: {
          dimColor: tokens.typography.secondaryDim,
        },
      },
      connectionStatus: {
        paddingX: tokens.spacing.sm,
        label: {
          dimColor: tokens.typography.secondaryDim,
        },
      },
      separator: {
        paddingX: tokens.spacing.sm,
        text: {
          dimColor: tokens.typography.secondaryDim,
        },
        content: tokens.separator.char.repeat(tokens.separator.width),
      },
      messageArea: {
        flexDirection: "column",
        flexGrow: 1,
      },
      footer: {
        paddingX: tokens.spacing.sm,
        text: {
          dimColor: tokens.typography.secondaryDim,
        },
      },
    }),
    [tokens],
  );
}
