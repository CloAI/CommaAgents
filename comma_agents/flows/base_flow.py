from typing import Callable, List, Union, Optional, Any, Dict, TypedDict
from ..agents.base_agent import BaseAgent

class BaseFlow:
    class FlowHooks(TypedDict, total=False):
        before_flow: Optional[Callable[..., Any]]
        alter_prompt_before_flow: Optional[Callable[..., Any]]
        after_flow: Optional[Callable[..., Any]]
        alter_prompt_after_flow: Optional[Callable[..., Any]]

    def __init__(
            self,
            flows: Union[BaseAgent, 'BaseFlow', List[Union[BaseAgent, 'BaseFlow']]],
            verbose_level: int = 1,
            flow_name: str = "",
            hooks: "BaseFlow.FlowHooks" = {},):
        # If a single flow or agent is passed, convert it to a list
        if isinstance(flows, (BaseAgent, BaseFlow)):
            flows = [flows]

        # Ensure that flows is a list of BaseAgent or BaseFlow instances
        if not all(isinstance(flow, (BaseAgent, BaseFlow)) for flow in flows):
            raise ValueError("All elements in flows must be instances of BaseAgent or BaseFlow")
        self.flows = flows
        self.flow_name = flow_name
        
        # Normalize hooks: convert single functions to lists or default to an empty list
        # TODO: Move this to a utility function
        def normalize_hook(hook: Optional[Callable[..., Any]]) -> List[Callable[..., Any]]:
            """
            Normalizes the hook input, ensuring it is in list format.

            :param hook: A single callable or a list of callables.
            :return: A list of callables.
            """
            return hook if isinstance(hook, list) else [hook] if hook is not None else []

        # Initializing hooks with provided values or default to empty lists
        self.hooks: Dict[str, List[Callable[..., Any]]] = {
            "before_flow": normalize_hook(hooks.get("before_flow")),
            "alter_prompt_before_flow": normalize_hook(hooks.get("alter_prompt_before_flow")),
            "after_flow": normalize_hook(hooks.get("after_flow")),
            "alter_prompt_after_flow": normalize_hook(hooks.get("alter_prompt_after_flow")),
        }

        self.verbose_level = verbose_level

        if verbose_level > 0:
            for flow in self.flows:
                if isinstance(flow, BaseAgent):
                    flow.verbose_level = verbose_level

    def run_flow(self, prompt=""):
        self._execute_hooks("before_flow")
        prompt = self._execute_alter_hooks("alter_prompt_before_flow", prompt=prompt)
        response = self._run_flow(prompt)
        self._execute_hooks("after_flow")
        response = self._execute_alter_hooks("alter_prompt_after_flow", prompt=prompt)
        return response

    def _run_flow(self, prompt=""):
        return f"Calling {self.flow_name} LLM with prompt {prompt}"

    # Updated method to include verbosity
    def _execute_hooks(self, hook_name, *args, **kwargs):
        """
        Executes a set of hooks based on the provided hook name.

        :param hook_name: The name of the hook stage to execute.
        :param args: Arguments for the hook.
        :param kwargs: Keyword arguments for the hook.
        """
        if self.verbose_level >= 3:
            print(f"Executing hooks for {hook_name} with args {args} and kwargs {kwargs}")
        elif self.verbose_level == 2:
            print(f"Executing hooks for {hook_name}")

        for hook in self.hooks.get(hook_name, []):
            hook(*args, **kwargs)

    def _execute_alter_hooks(self, hook_name: str, prompt: str) -> str:
        """
        Executes 'alter' hooks that can modify the prompt.

        :param hook_name: The name of the 'alter' hook stage to execute.
        :param prompt: The current prompt to be possibly modified by the hooks.
        :return: The modified prompt.
        """
        for hook in self.hooks.get(hook_name, []):
            prompt = hook(prompt)
        return prompt