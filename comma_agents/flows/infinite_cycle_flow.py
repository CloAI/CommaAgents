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
        super().__init__(cycles=1, **kwargs)
    
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
        while True:
            super()._run_flow(response)