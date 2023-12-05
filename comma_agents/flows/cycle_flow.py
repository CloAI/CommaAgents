from typing import Callable, List, Union, Optional, Any, Dict, TypedDict
from comma_agents.flows.base_flow import BaseFlow
from comma_agents.agents.base_agent import BaseAgent
import os
from colorama import Fore, Style

def print_cycle_flow_format(
    flow_name: str,
    cycles: int,
    cycle: int,
    use_unicode: bool = True
):
    water_wave = '\U0001F30A' if use_unicode else '[:water_wave:]'
    clockwise_vertical_arrows = '\U0001F503' if use_unicode else '[:clockwise_vertical_arrows:]'
    
    # Get the width of the terminal
    width = os.get_terminal_size().columns

    # Print the separator
    print("#" * width)
    print(water_wave + Fore.CYAN + "Cycle Name: " + flow_name + Style.RESET_ALL)
    print(clockwise_vertical_arrows + Fore.GREEN + "Cycle: " + str(cycle) + "/" + str(cycles) + Style.RESET_ALL)

    # Print the separator again
    print("#" * width)

class CycleFlow(BaseFlow):
    class CycleFlowHooks(BaseFlow.FlowHooks):
        alter_prompt_before_cycle: Optional[Callable[..., Any]]
        alter_prompt_after_cycle: Optional[Callable[..., Any]]


    def __init__(
            self,
            flows: Union[List[Union[BaseAgent, BaseFlow]], BaseFlow],
            cycles=1,
            hooks: "CycleFlow.CycleFlowHooks" = {},
            verbose_level: int = 1,
            **kwargs,
        ):
        super().__init__(flows, hooks=hooks, **kwargs)
        self.cycles = cycles

        def normalize_hook(hook: Optional[Callable[..., Any]]) -> List[Callable[..., Any]]:
            """
            Normalizes the hook input, ensuring it is in list format.

            :param hook: A single callable or a list of callables.
            :return: A list of callables.
            """
            return hook if isinstance(hook, list) else [hook] if hook is not None else []
        self.hooks["alter_prompt_before_cycle"] = normalize_hook(hooks.get("alter_prompt_before_cycle"))
        self.hooks["alter_prompt_after_cycle"] = normalize_hook(hooks.get("alter_prompt_after_cycle"))

    def _run_flow(self, prompt=""):
        response = prompt
        for cycle in range(self.cycles):
            if self.verbose_level >= 1:
                print_cycle_flow_format(self.flow_name, self.cycles, cycle + 1)
            
            response = self._execute_alter_hooks("alter_prompt_before_cycle", prompt=response)
            # Run the flow with the current prompt (initially None, then the latest response)
            for flow in self.flows:
                if isinstance(flow, BaseAgent):
                    response = flow.call(response)
                elif isinstance(flow, BaseFlow):
                    response = flow.run_flow(response)
                else:
                    raise TypeError("Unsupported flow type")
            response = self._execute_alter_hooks("alter_prompt_after_cycle", prompt=response)

        return response
