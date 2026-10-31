"""Harbor adapter that runs a CommaAgents strategy headlessly inside a task container.

The adapter packs the local checkout (tracked and modified files, no node_modules),
uploads it, installs Bun and dependencies, then calls `comma run` with the task
instruction. Evaluating the local tree, not a published package, lets strategy and
prompt changes be compared before release.

    harbor run -d terminal-bench/terminal-bench@4.0.0 -l 10 \
      -a evals.harbor.comma_agent:CommaAgent \
      -m openrouter/google/gemini-3.5-flash \
      --ak strategy=Build --ae OPENROUTER_API_KEY=$OPENROUTER_API_KEY
"""

from __future__ import annotations

import shlex
import subprocess
import tarfile
import tempfile
from pathlib import Path

from harbor.agents.installed.base import BaseInstalledAgent, with_prompt_template
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext

REPO_ROOT = Path(__file__).resolve().parents[2]
REMOTE_ROOT = "/opt/comma"
REMOTE_ARCHIVE = "/tmp/comma-source.tar.gz"
REMOTE_LOG = "/logs/agent/comma-run.json"


def pack_checkout() -> Path:
    """Archive tracked and untracked-but-not-ignored files of the local checkout."""
    listed = subprocess.run(
        ["git", "ls-files", "-co", "--exclude-standard", "-z"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
    ).stdout.decode()
    archive_path = Path(tempfile.mkdtemp()) / "comma-source.tar.gz"
    with tarfile.open(archive_path, "w:gz") as archive:
        for relative_path in filter(None, listed.split("\0")):
            source_path = REPO_ROOT / relative_path
            if source_path.is_file():
                archive.add(source_path, arcname=relative_path)
    return archive_path


class CommaAgent(BaseInstalledAgent):
    """Runs `comma run --strategy <strategy>` for each Harbor trial."""

    def __init__(
        self,
        *args,
        strategy: str = "Build",
        max_user_turns: int | str = 1,
        approve: str = "allow",
        then: str = "",
        **kwargs,
    ):
        super().__init__(*args, **kwargs)
        self.strategy = strategy
        self.max_user_turns = int(max_user_turns)
        self.approve = approve
        self.then = [name for name in then.split(",") if name]

    @staticmethod
    def name() -> str:
        return "comma-agents"

    async def install(self, environment: BaseEnvironment) -> None:
        await self.exec_as_root(
            environment,
            command="command -v curl unzip git >/dev/null || "
            "(apt-get update && apt-get install -y curl unzip git)",
        )
        await self.exec_as_agent(
            environment,
            command="command -v bun >/dev/null || curl -fsSL https://bun.sh/install | bash",
        )

    async def configure(self, environment: BaseEnvironment) -> None:
        await environment.upload_file(pack_checkout(), REMOTE_ARCHIVE)
        await self.exec_as_agent(
            environment,
            command=(
                f"mkdir -p {REMOTE_ROOT} && tar -xzf {REMOTE_ARCHIVE} -C {REMOTE_ROOT} && "
                f'export PATH="$HOME/.bun/bin:$PATH" && cd {REMOTE_ROOT} && bun install --frozen-lockfile'
            ),
        )

    @with_prompt_template
    async def run(
        self, instruction: str, environment: BaseEnvironment, context: AgentContext
    ) -> None:
        command = [
            "bun",
            f"{REMOTE_ROOT}/packages/cli/src/main.ts",
            "run",
            "--strategy",
            self.strategy,
            "--input",
            instruction,
            "--cwd",
            "$PWD",
            "--max-user-turns",
            str(self.max_user_turns),
            "--approve",
            self.approve,
            "--json",
        ]
        if self.then:
            command += ["--then", *self.then]
        if self.model_name:
            command += ["--model", self.model_name]
        quoted = " ".join(
            part if part == "$PWD" else shlex.quote(part) for part in command
        )
        await self.exec_as_agent(
            environment,
            command=(
                f'export PATH="$HOME/.bun/bin:$PATH" && mkdir -p /logs/agent && '
                f"{quoted} > {REMOTE_LOG}"
            ),
        )
