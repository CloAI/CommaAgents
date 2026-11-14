import type { Meta, StoryObj } from "@storybook/react-vite";
import styles from "./Foundations.module.scss";

const colorTokens = [
  "canvas",
  "surface",
  "surface-raised",
  "primary",
  "on-primary",
  "text",
  "muted",
  "border",
  "focus",
  "success",
  "warning",
  "error",
];
const spacingTokens = [1, 2, 3, 4, 6, 8, 12];

function Foundations() {
  return (
    <main className={styles.foundations}>
      <h1>Design foundations</h1>
      <p>
        A dark, monospace foundation with lavender accents inherited from the
        terminal UI. Use semantic CSS variables throughout components.
      </p>
      <section aria-labelledby="colors">
        <h2 id="colors">Colors</h2>
        <ul className={styles.colors}>
          {colorTokens.map((token) => (
            <li key={token}>
              <span
                className={styles.swatch}
                style={{ backgroundColor: `var(--color-${token})` }}
              />
              <code>--color-{token}</code>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="typography">
        <h2 id="typography">Typography</h2>
        <p className={styles.title}>Comma Agents</p>
        <p>Body: self-hosted Geist Mono, 1rem, line height 1.6.</p>
        <p className={styles.small}>Small: labels and actions, 0.8125rem.</p>
      </section>
      <section aria-labelledby="icons">
        <h2 id="icons">Icons</h2>
        <p>
          Use Lucide outline icons at 16px inside compact 28px icon buttons.
          Every icon-only action needs an accessible label. The sidebar uses a
          fixed 44px rail.
        </p>
      </section>
      <section aria-labelledby="spacing">
        <h2 id="spacing">Spacing</h2>
        <p>
          A 4px base at the default root font size. Rem units respect browser
          font settings.
        </p>
        <ul className={styles.spacing}>
          {spacingTokens.map((token) => (
            <li key={token}>
              <code>--space-{token}</code>
              <span style={{ width: `var(--space-${token})` }} />
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="shape">
        <h2 id="shape">Shape and focus</h2>
        <p>
          Controls use 4px corners. Inputs, text areas, and selects keep their
          normal borders on focus without an outline. Buttons highlight their
          background on keyboard focus and use a compact minimum height of 28px,
          with 4px vertical and 8px horizontal padding.
        </p>
      </section>
      <section aria-labelledby="motion">
        <h2 id="motion">Motion</h2>
        <p>
          Control transitions use 120ms and become immediate with reduced
          motion. The ASCII logo animates automatically at 16 fps and stays
          static with reduced motion.
        </p>
      </section>
      <section aria-labelledby="composition">
        <h2 id="composition">Composition</h2>
        <p>
          Design-system primitives provide generic presentation. Application
          components combine primitives; screens arrange them and supply
          application behavior. Stories live beside their components as
          Domain.storybook.tsx files.
        </p>
      </section>
    </main>
  );
}

const meta = {
  title: "Design System/Foundations",
  component: Foundations,
} satisfies Meta<typeof Foundations>;

// oxlint-disable-next-line import/no-default-export -- Colocated Storybook stories require a default metadata export.
export default meta;
type Story = StoryObj<typeof meta>;
export const Overview: Story = {};
