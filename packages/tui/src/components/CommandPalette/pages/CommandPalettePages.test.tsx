import { describe, expect, it } from "bun:test";
import { render } from "ink-testing-library";
import { UserConfigContextProvider } from "../../../hooks/useUserConfig";
import { darkTheme } from "../../../Theme/themes/dark";
import { HelpPage, HelpPageRender } from "./HelpPage/HelpPage";
import { SettingsPage, SettingsPageRender } from "./SettingsPage/SettingsPage";

describe("command palette pages", () => {
  it("renders the complete shortcut help", () => {
    const { lastFrame } = render(<HelpPageRender tokens={darkTheme} />, {
      columns: 70,
    });

    expect(lastFrame()).toContain("Keyboard Shortcuts");
    expect(lastFrame()).toContain("Ctrl+P");
    expect(lastFrame()).toContain("Ctrl+C");
    expect(lastFrame()).toMatchSnapshot();
  });

  it("renders the help page container", () => {
    const { lastFrame } = render(<HelpPage focusId="help" onBack={() => {}} />);

    expect(lastFrame()).toContain("Keyboard Shortcuts");
  });

  it("renders theme settings with the active theme marked", () => {
    const { lastFrame } = render(
      <SettingsPageRender
        tokens={darkTheme}
        config={{ themeName: "dark" }}
        selectedIndex={0}
        onSelectedIndexChange={() => {}}
        onSelected={() => {}}
        isFocused={false}
      />,
      { columns: 80, rows: 12 },
    );

    expect(lastFrame()).toContain("Theme");
    expect(lastFrame()).toContain("Material Dark");
    expect(lastFrame()).toContain("Enter to apply");
    expect(lastFrame()).toMatchSnapshot();
  });

  it("renders the settings page container from user config", () => {
    const { lastFrame } = render(
      <UserConfigContextProvider configFilePath="/dev/null">
        <SettingsPage focusId="settings" onBack={() => {}} />
      </UserConfigContextProvider>,
      { columns: 80, rows: 12 },
    );

    expect(lastFrame()).toContain("Material Dark");
  });
});
