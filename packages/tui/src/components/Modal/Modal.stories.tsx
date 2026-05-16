import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Text } from "ink";
import { useEffect } from "react";
import { useModal } from "../../hooks/useModal";
import { Modal } from "./Modal";

/**
 * `Modal` renders a centered, bordered content box over a dimmed full-screen
 * backdrop. Visibility is driven entirely by `useModal(modalId)` from
 * `ModalContextProvider` (already wired globally in Storybook) — `<Modal>` returns
 * null when `!isOpen`. Esc closes the topmost modal by default.
 *
 * Stories use a small `OpenOnMount` harness to ask `useModal` to open the
 * matching id when the story mounts.
 */

function OpenOnMount({ id }: { id: string }) {
  const { open } = useModal(id);
  useEffect(() => {
    open();
  }, [open]);
  return null;
}

const meta: Meta<typeof Modal> = {
  title: "Components/Modal",
  component: Modal,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <>
      <OpenOnMount id="demo-modal" />
      <Modal modalId="demo-modal" title="Confirm" width="60%" height={10}>
        <Box flexDirection="column" padding={1}>
          <Text>Are you sure you want to proceed?</Text>
          <Box marginTop={1}>
            <Text dimColor>Press Esc to dismiss.</Text>
          </Box>
        </Box>
      </Modal>
    </>
  ),
};

export const SmallFixedSize: Story = {
  render: () => (
    <>
      <OpenOnMount id="small-modal" />
      <Modal modalId="small-modal" title="Notice" width={40} height={6}>
        <Box padding={1}>
          <Text>Saved successfully.</Text>
        </Box>
      </Modal>
    </>
  ),
};

export const Untitled: Story = {
  render: () => (
    <>
      <OpenOnMount id="untitled-modal" />
      <Modal modalId="untitled-modal" width="50%" height={8}>
        <Box flexDirection="column" padding={1}>
          <Text bold>No header</Text>
          <Text dimColor>This modal omits the `title` prop.</Text>
        </Box>
      </Modal>
    </>
  ),
};

export const NotCloseableViaEsc: Story = {
  render: () => (
    <>
      <OpenOnMount id="sticky-modal" />
      <Modal
        modalId="sticky-modal"
        title="Locked"
        width="50%"
        height={8}
        closeOnEsc={false}
      >
        <Box padding={1}>
          <Text>This modal cannot be dismissed with Esc.</Text>
        </Box>
      </Modal>
    </>
  ),
};
