from typing import Callable, List, Union, Optional, Any

import os
from colorama import Fore, Style

from comma_agents.flows.base_flow import BaseFlow
from comma_agents.agents.base_agent import BaseAgent
from comma_agents.utils.misc.or_one_value_to_array import or_one_value_to_array

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
    """
    CycleFlow is a subclass of BaseFlow designed to execute a series of flows or agents multiple times in a cycle.

    This class extends BaseFlow by adding the capability to run the specified flows repeatedly for a 
    defined number of cycles. It allows for additional customization through 'cycle' specific hooks.

    Parameters
    ----------
    flows : Union[List[Union[BaseAgent, BaseFlow]], BaseFlow], optional
        A single flow, agent, or a list of flows and agents that constitute the cycle. Default is an empty list.
    cycles : int, optional
        The number of times the sequence of flows should be executed. Default is 1.
    hooks : CycleFlow.CycleFlowHooks, optional
        Custom hooks for different stages of the cycle execution. Default is an empty dictionary.
    **kwargs
        Arbitrary keyword arguments that are passed to the BaseFlow's constructor for further customization.

    Attributes
    ----------
    cycles : int
        The number of cycles the flow should run.
    hooks : Dict[str, List[Callable[..., Any]]]
        The dictionary of hooks for different stages of cycle execution.

    Methods
    -------
    _run_flow(prompt='')
        Executes the flows in a cycle for the specified number of times.

    Examples
    --------
    >>> agent1 = BaseAgent(name="Agent1")
    >>> agent2 = BaseAgent(name="Agent2")
    >>> cycle_flow = CycleFlow(flows=[agent1, agent2], cycles=2)
    >>> response = cycle_flow.run_flow(prompt="Start")
    """

    class CycleFlowHooks(BaseFlow.FlowHooks):
        """
        A subclass of BaseFlow.FlowHooks defining additional hooks specific to the CycleFlow.

        Attributes
        ----------
        alter_prompt_before_cycle : Optional[Callable[..., Any]]
            Hook to modify the prompt before each cycle begins.
        alter_prompt_after_cycle : Optional[Callable[..., Any]]
            Hook to modify the prompt after each cycle ends.
        """
        alter_prompt_before_cycle: Optional[Callable[..., Any]]
        alter_prompt_after_cycle: Optional[Callable[..., Any]]


    def __init__(
            self,
            flows: Union[List[Union[BaseAgent, BaseFlow]], BaseFlow] = [],
            cycles: int = 1,
            hooks: "CycleFlow.CycleFlowHooks" = {},
            **kwargs,
        ):
        """
        Initializes a new instance of the CycleFlow class.

        The constructor sets up the cycle flow with the specified sequence of agents or flows, number of cycles, 
        cycle-specific hooks, and inherits additional configurations from BaseFlow.

        Parameters
        ----------
        flows : Union[List[Union[BaseAgent, BaseFlow]], BaseFlow], optional
            The flows to include in this cycle. Default is an empty list.
        cycles : int, optional
            The number of cycles the flow should run. Default is 1.
        hooks : CycleFlow.CycleFlowHooks, optional
            The custom hooks specific to the cycle flow. Default is an empty dictionary.
        **kwargs
            Additional keyword arguments for BaseFlow configuration.
        """
        super().__init__(flows, hooks=hooks, **kwargs)
        self.cycles = cycles

        # Set up the cycle-specific hooks
        self.hooks["alter_prompt_before_cycle"] = or_one_value_to_array(hooks.get("alter_prompt_before_cycle"))
        self.hooks["alter_prompt_after_cycle"] = or_one_value_to_array(hooks.get("alter_prompt_after_cycle"))

    def _run_flow(self, prompt=""):
        """
        Executes the defined flows in cycles for the given number of iterations.

        Each cycle runs the sequence of flows with the input prompt, potentially modified by the 
        'alter_prompt_before_cycle' and 'alter_prompt_after_cycle' hooks.

        Parameters
        ----------
        prompt : str, optional
            The initial prompt to start the cycle flow. Default is an empty string.

        Returns
        -------
        str
            The final response after all cycles are executed.

        Examples
        --------
        >>> cycle_flow = CycleFlow(flows=[BaseAgent(name="EchoAgent")], cycles=2)
        >>> response = cycle_flow._run_flow(prompt="Hello")
        'Hello'
        """
        response = prompt  # Initialize the response with the provided prompt

        # Iterate through each cycle as defined by self.cycles
        for cycle in range(self.cycles):
            # Print cycle information if verbose mode is enabled
            if self.verbose_level >= 1:
                print_cycle_flow_format(self.flow_name, self.cycles, cycle + 1)

            # Execute any hooks that may alter the prompt before the cycle starts
            response = self._execute_alter_hooks("alter_prompt_before_cycle", prompt=response)

            # Iterate through all the flows defined in self.flows
            for flow in self.flows:
                # If the flow is an instance of BaseAgent, use its 'call' method, else use 'run_flow' for BaseFlow instances
                response = flow.call(response) if isinstance(flow, BaseAgent) else flow.run_flow(response)

            # Execute any hooks that may alter the prompt after the cycle is completed
            response = self._execute_alter_hooks("alter_prompt_after_cycle", prompt=response)

        # Return the final response after all cycles have been executed
        return response
