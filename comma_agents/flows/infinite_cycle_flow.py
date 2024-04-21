from comma_agents.flows import CycleFlow


class InfiniteCycleFlow(CycleFlow):
    def __init__(
        self,
        **kwargs,
    ):
        """
        Initializes a new instance of the InfiniteCycleFlow class.

        The constructor sets up the infinite cycle flow with the specified sequence of agents or flows, 
        cycle-specific hooks, and inherits additional configurations from BaseFlow.

        Parameters
        ----------
        flows : Union[List[Union[BaseAgent, BaseFlow]], BaseFlow], optional
            The flows to include in this cycle. Default is an empty list.
        hooks : InfiniteCycleFlow.InfiniteCycleFlowHooks, optional
            The custom hooks specific to the infinite cycle flow. Default is an empty dictionary.
        **kwargs
            Additional keyword arguments for BaseFlow configuration.
        """
        super().__init__(flow_name="Infinite Cycle Flow", cycles=1, **kwargs)
    
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
        while True:
            super()._run_flow(response)