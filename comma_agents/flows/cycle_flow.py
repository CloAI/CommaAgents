from typing import Callable, List, Union, Optional, Any

from comma_agents.utils.print_formats import print_cycle_flow_format
from comma_agents.flows.base_flow import BaseFlow
from comma_agents.agents.base_agent import BaseAgent
from comma_agents.utils.misc.or_one_value_to_array import or_one_value_to_array

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
    _run_flow(message='')
        Executes the flows in a cycle for the specified number of times.

    Examples
    --------
    >>> agent1 = BaseAgent(name="Agent1")
    >>> agent2 = BaseAgent(name="Agent2")
    >>> cycle_flow = CycleFlow(flows=[agent1, agent2], cycles=2)
    >>> response = cycle_flow.run_flow(message="Start")
    """

    class CycleFlowHooks(BaseFlow.FlowHooks):
        """
        A subclass of BaseFlow.FlowHooks defining additional hooks specific to the CycleFlow.

        Attributes
        ----------
        alter_message_before_cycle : Optional[Callable[..., Any]]
            Hook to modify the message before each cycle begins.
        alter_message_after_cycle : Optional[Callable[..., Any]]
            Hook to modify the message after each cycle ends.
        """
        alter_message_before_cycle: Optional[Callable[..., Any]]
        alter_message_after_cycle: Optional[Callable[..., Any]]


    def __init__(
            self,
            flow_name: str,
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
        super().__init__(flow_name=flow_name, flows=flows, hooks=hooks, **kwargs)
        self.cycles = cycles

        # Set up the cycle-specific hooks
        self.hooks["alter_message_before_cycle"] = or_one_value_to_array(hooks.get("alter_message_before_cycle"))
        self.hooks["alter_message_after_cycle"] = or_one_value_to_array(hooks.get("alter_message_after_cycle"))

    def _run_flow(self, message=""):
        """
        Executes the defined flows in cycles for the given number of iterations.

        Each cycle runs the sequence of flows with the input message, potentially modified by the 
        'alter_message_before_cycle' and 'alter_message_after_cycle' hooks.

        Parameters
        ----------
        message : str, optional
            The initial message to start the cycle flow. Default is an empty string.

        Returns
        -------
        str
            The final response after all cycles are executed.

        Examples
        --------
        >>> cycle_flow = CycleFlow(flows=[BaseAgent(name="EchoAgent")], cycles=2)
        >>> response = cycle_flow._run_flow(message="Hello")
        'Hello'
        """
        response = message  # Initialize the response with the provided message

        # Iterate through each cycle as defined by self.cycles
        for cycle in range(self.cycles):
            # Print cycle information if verbose mode is enabled
            if self.verbose_level >= 1:
                print_cycle_flow_format(self.flow_name, self.cycles, cycle + 1)

            # Execute any hooks that may alter the message before the cycle starts
            response = self._execute_alter_hooks("alter_message_before_cycle", message=response)

            # Iterate through all the flows defined in self.flows
            for flow in self.flows:
                # If the flow is an instance of BaseAgent, use its 'call' method, else use 'run_flow' for BaseFlow instances
                response = flow.call(response) if isinstance(flow, BaseAgent) else flow.run_flow(response)

            # Execute any hooks that may alter the message after the cycle is completed
            response = self._execute_alter_hooks("alter_message_after_cycle", message=response)

        # Return the final response after all cycles have been executed
        return response
